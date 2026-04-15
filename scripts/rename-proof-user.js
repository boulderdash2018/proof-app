/**
 * Migration: rename @proof → @proof.
 *
 * Updates:
 *   1. users/{uid}.username        "proof" → "proof."
 *   2. users/{uid}.displayName     "Proof" → "Proof."
 *   3. All plans where authorId == uid  → author.username / author.displayName
 *   4. All comments where userId == uid → username / displayName
 *
 * Run:  node scripts/rename-proof-user.js
 * Requires Node.js 18+.
 */

const { initializeApp } = require('firebase/app');
const {
  getFirestore, collection, getDocs, updateDoc, doc, query, where,
} = require('firebase/firestore');

const firebaseConfig = {
  apiKey: 'AIzaSyBMwRpnw0zmOxkV661V5ByvWGf64GhjEsw',
  authDomain: 'proof-app-97cb0.firebaseapp.com',
  projectId: 'proof-app-97cb0',
  storageBucket: 'proof-app-97cb0.firebasestorage.app',
  messagingSenderId: '582557455243',
  appId: '1:582557455243:web:2c11ea8d53a343a99ad58e',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const OLD_USERNAME = 'proof';
const NEW_USERNAME = 'proof.';
const NEW_DISPLAY  = 'Proof.';

async function main() {
  console.log('🔄 Migration: @proof → @proof.\n');

  // ── 1. Find user ──
  const q = query(collection(db, 'users'), where('username', '==', OLD_USERNAME));
  const snap = await getDocs(q);

  if (snap.empty) {
    console.log('⚠️  No user found with username "proof". Maybe already renamed?');
    const q2 = query(collection(db, 'users'), where('username', '==', NEW_USERNAME));
    const snap2 = await getDocs(q2);
    if (!snap2.empty) console.log('✓ User already has username "proof."');
    process.exit(0);
  }

  const userDoc = snap.docs[0];
  const uid = userDoc.id;
  const userData = userDoc.data();
  console.log(`  Found user: ${uid} (${userData.displayName})`);

  // ── 2. Update user document ──
  await updateDoc(doc(db, 'users', uid), {
    username: NEW_USERNAME,
    displayName: NEW_DISPLAY,
  });
  console.log(`  ✓ User document updated: username="${NEW_USERNAME}", displayName="${NEW_DISPLAY}"`);

  // ── 3. Update all plans with this authorId ──
  const plansQ = query(collection(db, 'plans'), where('authorId', '==', uid));
  const plansSnap = await getDocs(plansQ);
  let planCount = 0;

  for (const planDoc of plansSnap.docs) {
    const plan = planDoc.data();
    const author = plan.author || {};

    // Only update if author object has the old values
    if (author.username === OLD_USERNAME || author.displayName === 'Proof') {
      await updateDoc(doc(db, 'plans', planDoc.id), {
        'author.username': NEW_USERNAME,
        'author.displayName': NEW_DISPLAY,
      });
      planCount++;
    }
  }
  console.log(`  ✓ Updated ${planCount} / ${plansSnap.size} plans`);

  // ── 4. Update comments by this user ──
  const commentsQ = query(collection(db, 'comments'), where('userId', '==', uid));
  const commentsSnap = await getDocs(commentsQ);
  let commentCount = 0;

  for (const commentDoc of commentsSnap.docs) {
    const comment = commentDoc.data();
    if (comment.username === OLD_USERNAME || comment.displayName === 'Proof') {
      const updates = {};
      if (comment.username === OLD_USERNAME) updates.username = NEW_USERNAME;
      if (comment.displayName === 'Proof') updates.displayName = NEW_DISPLAY;
      await updateDoc(doc(db, 'comments', commentDoc.id), updates);
      commentCount++;
    }
  }
  console.log(`  ✓ Updated ${commentCount} / ${commentsSnap.size} comments`);

  // ── 5. Update notifications mentioning this user ──
  const notifsQ = query(collection(db, 'notifications'), where('sender.id', '==', uid));
  const notifsSnap = await getDocs(notifsQ);
  let notifCount = 0;

  for (const notifDoc of notifsSnap.docs) {
    const notif = notifDoc.data();
    const sender = notif.sender || {};
    if (sender.username === OLD_USERNAME || sender.displayName === 'Proof') {
      await updateDoc(doc(db, 'notifications', notifDoc.id), {
        'sender.username': NEW_USERNAME,
        'sender.displayName': NEW_DISPLAY,
      });
      notifCount++;
    }
  }
  console.log(`  ✓ Updated ${notifCount} / ${notifsSnap.size} notifications`);

  console.log('\n✅ Migration complete. @proof is now @proof.\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
