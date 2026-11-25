// annulerTransaction : jamais d'erreur quand la transaction est déjà annulée ou que deux annulations se croisent (cas
// vu sous charge : « illegal state transition from TRANSACTION_ABORTED », qui changeait un refus 400 en 500).
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const mongoose = require('mongoose');
const { demarrer, BACK } = require('./aide');
const { annulerTransaction } = require(path.join(BACK, 'src/services/transactionService'));

let ctx;
before(async () => { ctx = await demarrer(); });
after(async () => { await ctx?.arreter(); });

const ouvrir = async () => {
  const session = await mongoose.startSession();
  session.startTransaction();
  await mongoose.connection.collection('formules').findOne({}, { session }); // Transaction réellement commencée
  return session;
};

test('deux annulations simultanées : aucune erreur, transaction close', async () => {
  const session = await ouvrir();
  await Promise.all([annulerTransaction(session), annulerTransaction(session)]);
  assert.strictEqual(session.inTransaction(), false);
  await session.endSession();
});

test('transaction déjà annulée, ou sans transaction : aucune erreur', async () => {
  const session = await ouvrir();
  await session.abortTransaction();
  await annulerTransaction(session);
  await annulerTransaction(session);
  await annulerTransaction(null);
  await session.endSession();
});

test('sans la protection, la seconde annulation échoue bien (le cas corrigé existe)', async () => {
  const session = await ouvrir();
  await session.abortTransaction();
  await assert.rejects(() => session.abortTransaction());
  await session.endSession();
});
