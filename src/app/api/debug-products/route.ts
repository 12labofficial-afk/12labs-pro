import { NextResponse } from "next/server";
import { initializeFirebase } from "@/firebase/server";

export async function GET() {
    try {
        const { firestore, database } = initializeFirebase();
        const ids = ["12labs-4h5BNUGPPJjIZOdQ9pTN", "12labs-jarv5QzA3KO6iEjh6BYF", "12labs-prod-xyz"];
        
        const results: any = {};
        for (const id of ids) {
            const rtdb = await database.ref(`storeProducts/${id}`).get();
            const fstore = await firestore.collection('products').doc(id).get();
            results[id] = {
                inRTDB: rtdb.exists(),
                inFirestore: fstore.exists
            };
        }
        
        return NextResponse.json(results);
    } catch (e: any) {
        return NextResponse.json({ error: e.message });
    }
}
