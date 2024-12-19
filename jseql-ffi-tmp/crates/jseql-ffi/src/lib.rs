use cipherstash_client::{
    config::{
        console_config::ConsoleConfig, cts_config::CtsConfig, errors::ConfigError,
        zero_kms_config::ZeroKMSConfig,
    },
    credentials::service_credentials::ServiceCredentials,
    encryption::{
        Encrypted, EncryptionError, Plaintext, PlaintextTarget, ReferencedPendingPipeline,
        ScopedCipher, TypeParseError,
    },
    schema::ColumnConfig,
    zerokms::{self, EncryptedRecord},
};
use neon::prelude::*;
use once_cell::sync::OnceCell;
use std::sync::Arc;
use tokio::runtime::Runtime;

// Return a global tokio runtime or create one if it doesn't exist.
// Throws a JavaScript exception if the `Runtime` fails to create.
fn runtime<'a, C: Context<'a>>(cx: &mut C) -> NeonResult<&'static Runtime> {
    static RUNTIME: OnceCell<Runtime> = OnceCell::new();

    RUNTIME.get_or_try_init(|| Runtime::new().or_else(|err| cx.throw_error(err.to_string())))
}

#[derive(Clone)]
struct Client {
    cipher: Arc<ScopedZeroKMSNoRefresh>,
}

impl Finalize for Client {}

#[derive(thiserror::Error, Debug)]
pub enum Error {
    #[error(transparent)]
    Config(#[from] ConfigError),
    #[error(transparent)]
    ZeroKMS(#[from] zerokms::Error),
    #[error(transparent)]
    TypeParse(#[from] TypeParseError),
    #[error(transparent)]
    Encryption(#[from] EncryptionError),
    #[error("jseql-ffi invariant violation: {0}. This is a bug in jseql-ffi. Please file an issue at https://github.com/cipherstash/jseql-ffi/issues.")]
    InvariantViolation(String),
    #[error("{0}")]
    Base85(String),
    #[error("unimplemented: {0} not supported yet by jseql-ffi")]
    Unimplemented(String),
}

type ScopedZeroKMSNoRefresh = ScopedCipher<ServiceCredentials>;

fn new_client(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let rt = runtime(&mut cx)?;
    let channel = cx.channel();

    let (deferred, promise) = cx.promise();

    rt.spawn(async move {
        let client_result = new_client_inner().await;

        deferred.settle_with(&channel, move |mut cx| {
            let client = client_result.or_else(|err| cx.throw_error(err.to_string()))?;

            Ok(cx.boxed(client))
        })
    });

    Ok(promise)
}

async fn new_client_inner() -> Result<Client, Error> {
    let console_config = ConsoleConfig::builder().with_env().build()?;
    let cts_config = CtsConfig::builder().with_env().build()?;
    let zerokms_config = ZeroKMSConfig::builder()
        .console_config(&console_config)
        .cts_config(&cts_config)
        .with_env()
        .build_with_client_key()?;

    let zerokms = zerokms_config.create_client();

    let cipher = ScopedZeroKMSNoRefresh::init(Arc::new(zerokms), None).await?;

    Ok(Client {
        cipher: Arc::new(cipher),
    })
}

fn encrypt(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let plaintext = cx.argument::<JsString>(0)?.value(&mut cx);
    let column_name = cx.argument::<JsString>(1)?.value(&mut cx);
    let client = (&**cx.argument::<JsBox<Client>>(2)?).clone();

    let rt = runtime(&mut cx)?;
    let channel = cx.channel();

    // Create a JavaScript promise and a `deferred` handle for resolving it.
    // It is important to be careful not to perform failable actions after
    // creating the promise to avoid an unhandled rejection.
    let (deferred, promise) = cx.promise();

    // Spawn an `async` task on the tokio runtime. Only Rust types that are
    // `Send` may be moved into this block. `Context` may not be passed and all
    // JavaScript values must first be converted to Rust types.
    //
    // This task will _not_ block the JavaScript main thread.
    rt.spawn(async move {
        let ciphertext_result = encrypt_inner(plaintext, column_name, client).await;

        // Settle the promise from the result of a closure. JavaScript exceptions
        // will be converted to a Promise rejection.
        //
        // This closure will execute on the JavaScript main thread. It should be
        // limited to converting Rust types to JavaScript values. Expensive operations
        // should be performed outside of it.
        deferred.settle_with(&channel, move |mut cx| {
            let ciphertext = ciphertext_result.or_else(|err| cx.throw_error(err.to_string()))?;

            Ok(cx.string(ciphertext))
        });
    });

    Ok(promise)
}

async fn encrypt_inner(
    plaintext: String,
    column_name: String,
    client: Client,
) -> Result<String, Error> {
    let column_config = ColumnConfig::build(column_name);
    let mut pipeline = ReferencedPendingPipeline::new(client.cipher);
    let encryptable = PlaintextTarget::new(plaintext, column_config.clone(), None);

    pipeline.add_with_ref::<PlaintextTarget>(encryptable, 0)?;

    let mut source_encrypted = pipeline.encrypt().await?;

    let encrypted = source_encrypted.remove(0).ok_or_else(|| {
        Error::InvariantViolation(
            "`encrypt` expected a single result in the pipeline, but there were none".to_string(),
        )
    })?;

    match encrypted {
        Encrypted::Record(ciphertext, _terms) => ciphertext
            .to_mp_base85()
            // The error type from `to_mp_base85` isn't public, so we don't derive an error for this one.
            // Instead, we use `map_err`.
            .map_err(|err| Error::Base85(err.to_string())),

        Encrypted::SteVec(_) => Err(Error::Unimplemented(
            "`SteVec`s and encrypted JSONB columns".to_string(),
        )),
    }
}

fn decrypt(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let ciphertext = cx.argument::<JsString>(0)?.value(&mut cx);
    let client = (&**cx.argument::<JsBox<Client>>(1)?).clone();

    let rt = runtime(&mut cx)?;
    let channel = cx.channel();

    let (deferred, promise) = cx.promise();

    rt.spawn(async move {
        let decrypt_result = decrypt_inner(ciphertext, client).await;

        deferred.settle_with(&channel, move |mut cx| {
            let plaintext = decrypt_result.or_else(|err| cx.throw_error(err.to_string()))?;

            Ok(cx.string(plaintext))
        });
    });

    Ok(promise)
}

async fn decrypt_inner(ciphertext: String, client: Client) -> Result<String, Error> {
    let encrypted_record = EncryptedRecord::from_mp_base85(&ciphertext)
        // The error type from `to_mp_base85` isn't public, so we don't derive an error for this one.
        // Instead, we use `map_err`.
        .map_err(|err| Error::Base85(err.to_string()))?;

    let decrypted = client.cipher.decrypt([encrypted_record]).await?;
    let plaintext = Plaintext::from_slice(&decrypted[0][..])?;

    match plaintext {
        Plaintext::Utf8Str(Some(ref inner)) => Ok(inner.clone()),
        _ => Err(Error::Unimplemented(
            "data types other than `Utf8Str`".to_string(),
        )),
    }
}

#[neon::main]
fn main(mut cx: ModuleContext) -> NeonResult<()> {
    cx.export_function("newClient", new_client)?;
    cx.export_function("encrypt", encrypt)?;
    cx.export_function("decrypt", decrypt)?;

    Ok(())
}
