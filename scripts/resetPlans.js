/**
 * Reset all plans data from Firestore while keeping user accounts.
 * Deletes: plans, proofVotes, savedPlans, comments, placeReviews
 * Resets: plan-related counters on user docs
 *
 * Run: node scripts/resetPlans.js
 */

const { initializeApp } = require('firebase/app');
const {
  getFirestore,
  collection,
  getDocs,
  deleteDoc,
  updateDoc,
  doc,
} = require('firebase/firestore');

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

async function deleteCollection(path) {
  const snap = await getDocs(collection(db, path));
  let count = 0;
  for (const d of snap.docs) {
    await deleteDoc(d.ref);
    count++;
  }
  return count;
}

async function run() {
  console.log('=== RESET PLANS DATA ===\n');

  // 1. Delete proofVotes subcollections under each plan
  console.log('1. Deleting proofVotes subcollections...');
  const plansSnap = await getDocs(collection(db, 'plans'));
  let proofVotesCount = 0;
  for (const planDoc of plansSnap.docs) {
    const subSnap = await getDocs(collection(db, `plans/${planDoc.id}/proofVotes`));
    for (const voteDoc of subSnap.docs) {
      await deleteDoc(voteDoc.ref);
      proofVotesCount++;
    }
  }
  console.log(`   Deleted ${proofVotesCount} proofVotes`);

  // 2. Delete all plans
  console.log('2. Deleting plans...');
  const plansCount = await deleteCollection('plans');
  console.log(`   Deleted ${plansCount} plans`);

  // 3. Delete all comments
  console.log('3. Deleting comments...');
  const commentsCount = await deleteCollection('comments');
  console.log(`   Deleted ${commentsCount} comments`);

  // 4. Delete all placeReviews
  console.log('4. Deleting placeReviews...');
  const reviewsCount = await deleteCollection('placeReviews');
  console.log(`   Deleted ${reviewsCount} placeReviews`);

  // 5. Delete all savedPlans subcollections under each user
  console.log('5. Deleting savedPlans from all users...');
  const usersSnap = await getDocs(collection(db, 'users'));
  let savedCount = 0;
  for (const userDoc of usersSnap.docs) {
    const subSnap = await getDocs(collection(db, `users/${userDoc.id}/savedPlans`));
    for (const savedDoc of subSnap.docs) {
      await deleteDoc(savedDoc.ref);
      savedCount++;
    }
  }
  console.log(`   Deleted ${savedCount} savedPlans`);

  // 6. Delete all likedPlans subcollections under each user
  console.log('6. Deleting likedPlans from all users...');
  let likedCount = 0;
  for (const userDoc of usersSnap.docs) {
    const subSnap = await getDocs(collection(db, `users/${userDoc.id}/likedPlans`));
    for (const likedDoc of subSnap.docs) {
      await deleteDoc(likedDoc.ref);
      likedCount++;
    }
  }
  console.log(`   Deleted ${likedCount} likedPlans`);

  // 7. Reset plan-related counters on user docs
  console.log('7. Resetting user counters...');
  let usersReset = 0;
  for (const userDoc of usersSnap.docs) {
    await updateDoc(doc(db, 'users', userDoc.id), {
      planCount: 0,
      total_proof_validations: 0,
      comments_given_count: 0,
      places_rated_count: 0,
      plans_saved_count: 0,
      plans_completed_count: 0,
      likesReceived: 0,
    });
    usersReset++;
  }
  console.log(`   Reset counters on ${usersReset} users`);

  console.log('\n=== DONE ===');
  console.log(`Plans: ${plansCount} | Comments: ${commentsCount} | Reviews: ${reviewsCount}`);
  console.log(`ProofVotes: ${proofVotesCount} | SavedPlans: ${savedCount} | LikedPlans: ${likedCount}`);
  console.log(`Users reset: ${usersReset}`);
  process.exit(0);
}

run().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});
