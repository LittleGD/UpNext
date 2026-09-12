import fs from "node:fs/promises";
import assert from "node:assert/strict";
import ts from "typescript";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  getDocs,
  collection,
  writeBatch,
  runTransaction,
  updateDoc,
  arrayUnion,
  arrayRemove,
  deleteField,
} from "firebase/firestore";
const js = ts.transpileModule(await fs.readFile("src/lib/duo.ts", "utf8"), {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
  },
}).outputText;
const helpers = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
);
const [host, port] = (
  process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8188"
).split(":");
const env = await initializeTestEnvironment({
  projectId: "demo-upnext-duo",
  firestore: {
    host,
    port: Number(port),
    rules: await fs.readFile("firestore.rules", "utf8"),
  },
});
const clients = new Map();
const db = (uid) => {
  if (!clients.has(uid))
    clients.set(uid, env.authenticatedContext(uid).firestore());
  return clients.get(uid);
};
const now = Date.now();
async function invite(id, code, expired = false) {
  const b = writeBatch(db("host"));
  b.set(
    doc(db("host"), "duos", id),
    helpers.buildDuoCreateData("host", "Host", now),
  );
  b.set(
    doc(db("host"), "duoInvites", code),
    helpers.buildInviteCreateData(
      code,
      id,
      "host",
      expired ? now - 300000000 : now,
    ),
  );
  await assertSucceeds(b.commit());
}
async function join(uid, code) {
  const store = db(uid);
  return runTransaction(store, async (tx) => {
    const ref = doc(store, "duoInvites", code);
    const raw = (await tx.get(ref)).data();
    const invite = helpers.parseUsableInvite(raw, Date.now());
    if (!invite || raw.createdBy === uid) throw Error("invalid invite");
    tx.update(
      doc(store, "duos", invite.duoId),
      helpers.buildJoinDuoUpdate(uid, uid, Date.now(), code, {
        arrayUnion,
        arrayRemove,
        deleteField,
      }),
    );
    tx.update(ref, { status: "joined" });
  });
}
try {
  await env.clearFirestore();
  await invite("one", "ABCD23");
  await assertFails(getDoc(doc(db("guest"), "duos", "one")));
  await assertFails(getDocs(collection(db("guest"), "duoInvites")));
  await assertFails(
    getDoc(
      doc(env.unauthenticatedContext().firestore(), "duoInvites", "ABCD23"),
    ),
  );
  await assertSucceeds(join("guest", "ABCD23"));
  assert.deepEqual(
    (await getDoc(doc(db("guest"), "duos", "one"))).data().memberIds,
    ["host", "guest"],
  );
  await assertSucceeds(
    updateDoc(
      doc(db("guest"), "duos", "one"),
      helpers.buildCheckInUpdate("guest", "2026-09-12", Date.now(), {
        arrayUnion,
        arrayRemove,
        deleteField,
      }),
    ),
  );
  await assertFails(
    updateDoc(doc(db("guest"), "duos", "one"), { "checkIns.host": ["forged"] }),
  );
  await assert.rejects(join("third", "ABCD23"));
  await invite("race", "RACE23");
  const race = await Promise.allSettled([
    join("a", "RACE23"),
    join("b", "RACE23"),
  ]);
  assert.equal(race.filter((x) => x.status === "fulfilled").length, 1);
  await invite("expired", "EXPR23", true);
  await assert.rejects(join("guest2", "EXPR23"));
  const forged = writeBatch(db("guest2"));
  forged.update(
    doc(db("guest2"), "duos", "expired"),
    helpers.buildJoinDuoUpdate("guest2", "Guest", Date.now(), "EXPR23", {
      arrayUnion,
      arrayRemove,
      deleteField,
    }),
  );
  forged.update(doc(db("guest2"), "duoInvites", "EXPR23"), {
    status: "joined",
  });
  await assertFails(forged.commit());
  await invite("wrong", "WRNG23");
  await assertFails(
    updateDoc(
      doc(db("attacker"), "duos", "wrong"),
      helpers.buildJoinDuoUpdate("attacker", "X", Date.now(), "ABCD23", {
        arrayUnion,
        arrayRemove,
        deleteField,
      }),
    ),
  );
  await assertFails(
    updateDoc(doc(db("attacker"), "duoInvites", "WRNG23"), {
      status: "joined",
    }),
  );
  await assertFails(
    writeBatch(db("attacker"))
      .set(
        doc(db("attacker"), "duoInvites", "FAKE23"),
        helpers.buildInviteCreateData(
          "FAKE23",
          "wrong",
          "attacker",
          Date.now(),
        ),
      )
      .commit(),
  );
  await assert.rejects(join("host", "WRNG23"));
  await assertSucceeds(
    updateDoc(
      doc(db("guest"), "duos", "one"),
      helpers.buildLeaveUpdate("guest", Date.now(), {
        arrayUnion,
        arrayRemove,
        deleteField,
      }),
    ),
  );
  await assertFails(getDoc(doc(db("guest"), "duos", "one")));
  console.log(
    "PASS: private reads, invite enumeration, unauthenticated access, atomic join, concurrent join, expired/forged/self/reused invites, partner writes, and leave.",
  );
} finally {
  await env.cleanup();
}
