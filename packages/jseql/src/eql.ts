const { newClient, encrypt, decrypt } = require('@cipherstash/jseql-ffi');

export type Eql = {
  client: Client;
  field: (opts: FieldOpts) => EqlField;
};

export type Client = {};

export type FieldOpts = {
  table: string;
  column: string;
};

export type EqlField = {
  client: Client;
  table: string;
  column: string;
  plaintextPayload: (plaintext: string) => PlaintextEqlPayload;
  decrypt: (
    encryptedPayload: EncryptedEqlPayload
  ) => Promise<PlaintextEqlPayload>;
};

export type EncryptedEqlPayload = {
  c: string;
};

export type PlaintextEqlPayload = {
  plaintext: string;
  field: EqlField;
  encrypt: () => Promise<EncryptedEqlPayload>;
};

export function eql(): Promise<Eql> {
  return newClient().then((client: Client) => newEql(client));
}

function newEql(client: Client): Eql {
  return {
    client,
    field(opts: FieldOpts): EqlField {
      return {
        client: this.client,
        table: opts.table,
        column: opts.column,
        plaintextPayload(plaintext: string): PlaintextEqlPayload {
          return newPlaintextPayload(this, plaintext);
        },
        decrypt(
          encryptedPayload: EncryptedEqlPayload
        ): Promise<PlaintextEqlPayload> {
          return decrypt(encryptedPayload.c, this.client).then((val: string) =>
            newPlaintextPayload(this, val)
          );
        },
      };
    },
  };
}

function newPlaintextPayload(
  field: EqlField,
  plaintext: string
): PlaintextEqlPayload {
  return {
    plaintext,
    field,
    encrypt(): Promise<EncryptedEqlPayload> {
      return encrypt(this.plaintext, this.field.column, this.field.client).then(
        (val: string) => {
          return { c: val };
        }
      );
    },
  };
}

//
// Example code using this module:
//

// (async () => {
//   const eqlClient = await eql();

//   const emailField = eqlClient.field({
//     table: "users",
//     column: "email",
//   });

//   const encryptedEmail = await emailField.plaintextPayload("abcdef").encrypt();

//   console.log(encryptedEmail);

//   const decrypted = await emailField.decrypt(encryptedEmail);

//   console.log(decrypted.plaintext);
// })();
