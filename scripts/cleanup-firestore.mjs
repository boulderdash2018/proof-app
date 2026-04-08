/**
 * One-time cleanup script — delete all plans, comments, placeReviews
 * and clear user saved/liked plan subcollections.
 * Run: node scripts/cleanup-firestore.mjs
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, deleteDoc, doc, updateDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBMwRpnw0zmOxkV661V5ByvWGf64GhjEsw",
  authDomain: "proof-app-97cb0.firebaseapp.com",
  projectId: "proof-app-97cb0",
  storageBucket: "proof-app-97cb0.firebasestorage.app",
  messagingSenderId: "582557455243",
  appId: "1:582557455243:web:2c11ea8d53a343a99ad58e",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function deleteCollection(name) {
  const snap = await getDocs(collection(db, name));
  let count = 0;
  for (const d of snap.docs) {
    await deleteDoc(doc(db, name, d.id));
    count++;
  }
  console.log(`  ✓ ${name}: ${count} documents supprimés`);
  return count;
}

async function deleteSubcollections(parentCollection, subcollectionName) {
  const parentSnap = await getDocs(collection(db, parentCollection));
  let count = 0;
  for (const parentDoc of parentSnap.docs) {
    const subSnap = await getDocs(collection(db, parentCollection, parentDoc.id, subcollectionName));
    for (const subDoc of subSnap.docs) {
      await deleteDoc(doc(db, parentCollection, parentDoc.id, subcollectionName, subDoc.id));
      count++;
    }
  }
  console.log(`  ✓ ${parentCollection}/*/  ${subcollectionName}: ${count} documents supprimés`);
  return count;
}

async function resetUserStats() {
  const usersSnap = await getDocs(collection(db, 'users'));
  let count = 0;
  for (const userDoc of usersSnap.docs) {
    try {
      await updateDoc(doc(db, 'users', userDoc.id), {
        plans_completed_count: 0,
        total_proof_validations: 0,
        comments_given_count: 0,
        places_rated_count: 0,
        plans_saved_count: 0,
        plan_sessions: [],
        plan_photos: [],
      });
      count++;
    } catch (e) {
      // Some fields might not exist, ignore
    }
  }
  console.log(`  ✓ users: ${count} profils stats remis à zéro`);
}

async function main() {
  console.log('\n🧹 Nettoyage Firestore — Proof App\n');

  // 1. Delete subcollections under plans (proofVotes)
  console.log('Suppression des sous-collections...');
  await deleteSubcollections('plans', 'proofVotes');

  // 2. Delete subcollections under users (savedPlans, likedPlans)
  await deleteSubcollections('users', 'savedPlans');
  await deleteSubcollections('users', 'likedPlans');

  // 3. Delete top-level collections
  console.log('\nSuppression des collections principales...');
  await deleteCollection('plans');
  await deleteCollection('comments');
  await deleteCollection('placeReviews');

  // 4. Reset user stats
  console.log('\nRemise à zéro des stats utilisateurs...');
  await resetUserStats();

  console.log('\n✅ Nettoyage terminé — page blanche !\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Erreur:', err);
  process.exit(1);
});
