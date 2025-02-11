use cipherstash_client::{
    config::{
        console_config::ConsoleConfig, cts_config::CtsConfig, errors::ConfigError,
        zero_kms_config::ZeroKMSConfig,
    },
    credentials::{ServiceCredentials, ServiceToken},
    encryption::{
        Encrypted, EncryptionError, Plaintext, PlaintextTarget, ReferencedPendingPipeline,
        ScopedCipher, TypeParseError,
    },
    schema::ColumnConfig,
    zerokms::{self, EncryptedRecord, WithContext, ZeroKMSWithClientKey},
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
    zerokms: Arc<ZeroKMSWithClientKey<ServiceCredentials>>,
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
    #[error("protect-ffi invariant violation: {0}. This is a bug in protect-ffi. Please file an issue at https://github.com/cipherstash/protectjs/issues.")]
    InvariantViolation(String),
    #[error("{0}")]
    Base85(String),
    #[error("unimplemented: {0} not supported yet by protect-ffi")]
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

    let zerokms = Arc::new(zerokms_config.create_client());

    let cipher = ScopedZeroKMSNoRefresh::init(zerokms.clone(), None).await?;

    Ok(Client {
        cipher: Arc::new(cipher),
        zerokms,
    })
}

fn encrypt(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let client = (&**cx.argument::<JsBox<Client>>(0)?).clone();
    let plaintext = cx.argument::<JsString>(1)?.value(&mut cx);
    let column_name = cx.argument::<JsString>(2)?.value(&mut cx);
    let lock_context = encryption_context_from_js_value(cx.argument_opt(3), &mut cx)?;
    let service_token = service_token_from_js_value(cx.argument_opt(4), &mut cx)?;

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
        let ciphertext_result =
            encrypt_inner(client, plaintext, column_name, lock_context, service_token).await;

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
    client: Client,
    plaintext: String,
    column_name: String,
    encryption_context: Vec<zerokms::Context>,
    service_token: Option<ServiceToken>,
) -> Result<String, Error> {
    let column_config = ColumnConfig::build(column_name);
    let mut pipeline = ReferencedPendingPipeline::new(client.cipher);
    let mut encryptable = PlaintextTarget::new(plaintext, column_config.clone());
    encryptable.context = encryption_context;

    pipeline.add_with_ref::<PlaintextTarget>(encryptable, 0)?;

    let mut source_encrypted = pipeline.encrypt(service_token).await?;

    let encrypted = source_encrypted.remove(0).ok_or_else(|| {
        Error::InvariantViolation(
            "`encrypt` expected a single result in the pipeline, but there were none".to_string(),
        )
    })?;

    mp_base85_str_from_encrypted(encrypted)
}

fn encrypt_bulk(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let client = (&**cx.argument::<JsBox<Client>>(0)?).clone();
    let plaintext_targets = plaintext_targets_from_js_array(cx.argument::<JsArray>(1)?, &mut cx)?;
    let service_token = service_token_from_js_value(cx.argument_opt(2), &mut cx)?;

    let rt = runtime(&mut cx)?;
    let channel = cx.channel();

    let (deferred, promise) = cx.promise();

    rt.spawn(async move {
        let ciphertexts_result = encrypt_bulk_inner(client, plaintext_targets, service_token).await;

        deferred.settle_with(&channel, move |mut cx| {
            let ciphertexts = ciphertexts_result.or_else(|err| cx.throw_error(err.to_string()))?;
            js_array_from_string_vec(ciphertexts, &mut cx)
        });
    });

    Ok(promise)
}

async fn encrypt_bulk_inner(
    client: Client,
    plaintext_targets: Vec<PlaintextTarget>,
    service_token: Option<ServiceToken>,
) -> Result<Vec<String>, Error> {
    let len = plaintext_targets.len();
    let mut pipeline = ReferencedPendingPipeline::new(client.cipher);

    for (i, plaintext_target) in plaintext_targets.into_iter().enumerate() {
        pipeline.add_with_ref::<PlaintextTarget>(plaintext_target, i)?;
    }

    let mut source_encrypted = pipeline.encrypt(service_token).await?;

    let mut results: Vec<String> = Vec::with_capacity(len);

    for i in 0..len {
        let encrypted = source_encrypted.remove(i).ok_or_else(|| {
            Error::InvariantViolation(
                format!(
                    "`encrypt_bulk` expected a result in the pipeline at index {i}, but there were none"
                )
            )
        })?;

        results.push(mp_base85_str_from_encrypted(encrypted)?);
    }

    Ok(results)
}

fn decrypt(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let client = (&**cx.argument::<JsBox<Client>>(0)?).clone();
    let ciphertext = cx.argument::<JsString>(1)?.value(&mut cx);
    let lock_context = encryption_context_from_js_value(cx.argument_opt(2), &mut cx)?;
    let service_token = service_token_from_js_value(cx.argument_opt(3), &mut cx)?;

    let rt = runtime(&mut cx)?;
    let channel = cx.channel();

    let (deferred, promise) = cx.promise();

    rt.spawn(async move {
        let decrypt_result = decrypt_inner(client, ciphertext, lock_context, service_token).await;

        deferred.settle_with(&channel, move |mut cx| {
            let plaintext = decrypt_result.or_else(|err| cx.throw_error(err.to_string()))?;

            Ok(cx.string(plaintext))
        });
    });

    Ok(promise)
}

async fn decrypt_inner(
    client: Client,
    ciphertext: String,
    encryption_context: Vec<zerokms::Context>,
    service_token: Option<ServiceToken>,
) -> Result<String, Error> {
    let encrypted_record = encrypted_record_from_mp_base85(&ciphertext, encryption_context)?;

    let decrypted = client
        .zerokms
        .decrypt_single(encrypted_record, service_token)
        .await?;

    plaintext_str_from_bytes(decrypted)
}

fn decrypt_bulk(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let client = (&**cx.argument::<JsBox<Client>>(0)?).clone();
    let ciphertexts = ciphertexts_from_js_array(cx.argument::<JsArray>(1)?, &mut cx)?;
    let service_token = service_token_from_js_value(cx.argument_opt(2), &mut cx)?;

    let rt = runtime(&mut cx)?;
    let channel = cx.channel();

    let (deferred, promise) = cx.promise();

    rt.spawn(async move {
        let plaintexts_result = decrypt_bulk_inner(client, ciphertexts, service_token).await;

        deferred.settle_with(&channel, move |mut cx| {
            let plaintexts = plaintexts_result.or_else(|err| cx.throw_error(err.to_string()))?;
            js_array_from_string_vec(plaintexts, &mut cx)
        });
    });

    Ok(promise)
}

async fn decrypt_bulk_inner(
    client: Client,
    ciphertexts: Vec<(String, Vec<zerokms::Context>)>,
    service_token: Option<ServiceToken>,
) -> Result<Vec<String>, Error> {
    let len = ciphertexts.len();
    let mut encrypted_records: Vec<WithContext> = Vec::with_capacity(ciphertexts.len());

    for (ciphertext, encryption_context) in ciphertexts {
        let encrypted_record = encrypted_record_from_mp_base85(&ciphertext, encryption_context)?;
        encrypted_records.push(encrypted_record);
    }

    let decrypted = client
        .zerokms
        .decrypt(encrypted_records, service_token)
        .await?;

    let mut plaintexts: Vec<String> = Vec::with_capacity(len);

    for item in decrypted {
        plaintexts.push(plaintext_str_from_bytes(item)?);
    }

    Ok(plaintexts)
}

fn encryption_context_from_js_value(
    value: Option<Handle<JsValue>>,
    cx: &mut FunctionContext,
) -> NeonResult<Vec<zerokms::Context>> {
    let mut encryption_context: Vec<zerokms::Context> = Vec::new();

    if let Some(lock_context) = value {
        let lock_context: Handle<JsObject> = lock_context.downcast_or_throw(cx)?;

        let identity_claim: Option<Handle<JsArray>> = lock_context.get_opt(cx, "identityClaim")?;

        if let Some(identity_claim) = identity_claim {
            let identity_claims: Vec<Handle<JsValue>> = identity_claim.to_vec(cx)?;

            for claim in identity_claims {
                let claim = claim
                    .downcast_or_throw::<JsString, FunctionContext>(cx)?
                    .value(cx);

                encryption_context.push(zerokms::Context::new_identity_claim(&claim));
            }
        }
    }

    Ok(encryption_context)
}

fn service_token_from_js_value(
    value: Option<Handle<JsValue>>,
    cx: &mut FunctionContext,
) -> NeonResult<Option<ServiceToken>> {
    if let Some(service_token) = value {
        let service_token: Handle<JsObject> = service_token.downcast_or_throw(cx)?;

        let token = service_token
            .get::<JsString, _, _>(cx, "accessToken")?
            .value(cx);

        let expiry = service_token.get::<JsNumber, _, _>(cx, "expiry")?.value(cx);

        Ok(Some(ServiceToken::new(token, expiry as u64)))
    } else {
        Ok(None)
    }
}

fn plaintext_targets_from_js_array(
    js_array: Handle<'_, JsArray>,
    cx: &mut FunctionContext,
) -> NeonResult<Vec<PlaintextTarget>> {
    let js_values: Vec<Handle<JsValue>> = js_array.to_vec(cx)?;
    let mut plaintext_targets: Vec<PlaintextTarget> = Vec::with_capacity(js_values.len());

    for js_value in js_values {
        let obj: Handle<JsObject> = js_value.downcast_or_throw(cx)?;

        let plaintext = obj.get::<JsString, _, _>(cx, "plaintext")?.value(cx);

        let column = obj.get::<JsString, _, _>(cx, "column")?.value(cx);

        let lock_context = obj.get_opt::<JsValue, _, _>(cx, "lockContext")?;
        let lock_context = encryption_context_from_js_value(lock_context, cx)?;

        let column_config = ColumnConfig::build(column);
        let mut plaintext_target = PlaintextTarget::new(plaintext, column_config.clone());
        plaintext_target.context = lock_context;

        plaintext_targets.push(plaintext_target);
    }

    Ok(plaintext_targets)
}

fn ciphertexts_from_js_array(
    js_array: Handle<'_, JsArray>,
    cx: &mut FunctionContext,
) -> NeonResult<Vec<(String, Vec<zerokms::Context>)>> {
    let js_values: Vec<Handle<JsValue>> = js_array.to_vec(cx)?;
    let mut ciphertexts: Vec<(String, Vec<zerokms::Context>)> = Vec::with_capacity(js_values.len());

    for js_value in js_values {
        let obj: Handle<JsObject> = js_value.downcast_or_throw(cx)?;

        let ciphertext = obj.get::<JsString, _, _>(cx, "ciphertext")?.value(cx);

        let lock_context = obj.get_opt::<JsValue, _, _>(cx, "lockContext")?;
        let lock_context = encryption_context_from_js_value(lock_context, cx)?;

        ciphertexts.push((ciphertext, lock_context));
    }

    Ok(ciphertexts)
}

fn js_array_from_string_vec<'a, C: Context<'a>>(
    vec: Vec<String>,
    cx: &mut C,
) -> NeonResult<Handle<'a, JsArray>> {
    let js_array = JsArray::new(cx, vec.len());

    for (i, value) in vec.iter().enumerate() {
        let js_string = cx.string(value);
        js_array.set(cx, i as u32, js_string)?;
    }

    Ok(js_array)
}

fn encrypted_record_from_mp_base85(
    base85str: &str,
    encryption_context: Vec<zerokms::Context>,
) -> Result<WithContext, Error> {
    let encrypted_record = EncryptedRecord::from_mp_base85(base85str)
        // The error type from `to_mp_base85` isn't public, so we don't derive an error for this one.
        // Instead, we use `map_err`.
        .map_err(|err| Error::Base85(err.to_string()))?;

    Ok(WithContext {
        record: encrypted_record,
        context: encryption_context,
    })
}

fn plaintext_str_from_bytes(bytes: Vec<u8>) -> Result<String, Error> {
    let plaintext = Plaintext::from_slice(bytes.as_slice())?;

    match plaintext {
        Plaintext::Utf8Str(Some(ref inner)) => Ok(inner.clone()),
        _ => {
            return Err(Error::Unimplemented(
                "data types other than `Utf8Str`".to_string(),
            ))
        }
    }
}

fn mp_base85_str_from_encrypted(encrypted: Encrypted) -> Result<String, Error> {
    match encrypted {
        Encrypted::Record(ciphertext, _terms) => ciphertext
            .to_mp_base85()
            // The error type from `to_mp_base85` isn't public, so we don't derive an error for this one.
            // Instead, we use `map_err`.
            .map_err(|err| Error::Base85(err.to_string())),

        Encrypted::SteVec(_) => Err(Error::Unimplemented(
            "`SteVec`s and encrypted JSONB columns".to_string(),
        ))?,
    }
}

#[neon::main]
fn main(mut cx: ModuleContext) -> NeonResult<()> {
    cx.export_function("newClient", new_client)?;
    cx.export_function("encrypt", encrypt)?;
    cx.export_function("encryptBulk", encrypt_bulk)?;
    cx.export_function("decrypt", decrypt)?;
    cx.export_function("decryptBulk", decrypt_bulk)?;

    Ok(())
}
