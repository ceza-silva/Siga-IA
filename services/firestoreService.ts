import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  query,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";
import type { SchoolsData, School } from "../types";

// Define collection names
const USERS_COLLECTION = "users";
const SCHOOLS_COLLECTION = "schools";

/**
 * Fetches the private data for a specific user.
 * @param uid The user's unique ID.
 * @returns An object containing the user's data (lessonPlans, quizzes, etc.), or null if not found.
 */
export const getUserData = async (uid: string) => {
  const userDocRef = doc(db, USERS_COLLECTION, uid);
  const userDocSnap = await getDoc(userDocRef);
  return userDocSnap.exists() ? userDocSnap.data() : null;
};

/**
 * Updates a specific field in a user's private data document.
 * @param uid The user's unique ID.
 * @param field The name of the field to update (e.g., 'lessonPlans').
 * @param value The new value for the field.
 */
export const updateUserField = async (uid: string, field: string, value: any) => {
  const userDocRef = doc(db, USERS_COLLECTION, uid);
  await setDoc(userDocRef, { [field]: value }, { merge: true });
};


/**
 * Fetches all school data from the database.
 * Used for the student login screen to populate school options.
 * @returns A SchoolsData object containing all schools.
 */
export const getAllSchools = async (): Promise<SchoolsData> => {
    const schoolsCollectionRef = collection(db, SCHOOLS_COLLECTION);
    const querySnapshot = await getDocs(schoolsCollectionRef);
    const allSchools: SchoolsData = {};
    querySnapshot.forEach((doc) => {
        allSchools[doc.id] = doc.data() as School;
    });
    return allSchools;
};

/**
 * Fetches all schools owned by a specific teacher.
 * @param uid The teacher's unique ID.
 * @returns A SchoolsData object containing the schools managed by the teacher.
 */
export const getSchoolsForTeacher = async (uid: string): Promise<SchoolsData> => {
    const schoolsCollectionRef = collection(db, SCHOOLS_COLLECTION);
    const q = query(schoolsCollectionRef, where("ownerId", "==", uid));
    const querySnapshot = await getDocs(q);
    const teacherSchools: SchoolsData = {};
    querySnapshot.forEach((doc) => {
        teacherSchools[doc.id] = doc.data() as School;
    });
    return teacherSchools;
};

/**
 * Saves all school data for a given user.
 * This function is designed to handle additions, updates, and deletions.
 * @param uid The owner's (teacher's) unique ID.
 * @param localSchoolsData The current state of the schools data from the application.
 */
export const saveSchoolsForUser = async (uid: string, localSchoolsData: SchoolsData) => {
    const batch = writeBatch(db);
    const teacherSchoolsInDb = await getSchoolsForTeacher(uid);

    // Update or add schools
    for (const schoolName in localSchoolsData) {
        const schoolDocRef = doc(db, SCHOOLS_COLLECTION, schoolName);
        const schoolData = localSchoolsData[schoolName];
        batch.set(schoolDocRef, { ...schoolData, ownerId: uid });
    }

    // Delete schools that are no longer in the local data
    for (const schoolName in teacherSchoolsInDb) {
        if (!localSchoolsData[schoolName]) {
            const schoolDocRef = doc(db, SCHOOLS_COLLECTION, schoolName);
            batch.delete(schoolDocRef);
        }
    }

    await batch.commit();
};
