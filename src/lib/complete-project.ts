import { initializeFirebase } from '@/firebase/server';
import { revalidatePath } from 'next/cache';
import { FieldValue } from 'firebase-admin/firestore';
import { resolvePublicAudioUrl } from '@/lib/utils';
import { sendProjectReadyEmailAction } from '@/app/emails/actions';
import { reportServerError } from '@/lib/report-error';

/** Server-only. Callers must authorize first (admin action or webhook secret). */
export async function completeProject(
  projectId: string,
  userId: string,
  projectName: string,
  audioUrl: string,
  syncData?: string,
  adminEmail?: string,
  usedBridge: boolean = false
): Promise<{ success: boolean; message: string }> {
  const { firestore, database } = initializeFirebase();
  try {
    const batch = firestore.batch();
    
    // 📂 DYNAMIC PATH ROUTING
    const isPro = projectId.startsWith('PRO_');
    const rtdbPath = isPro ? 'pro_projects' : 'pending_projects';
    const collectionName = isPro ? 'pro_projects' : 'projects';
    
    const projectRef = firestore.collection(collectionName).doc(userId).collection('userProjects').doc(projectId);
    
    const updateData: any = { 
      id: projectId,
      userId: userId,
      status: 'completed', 
      audioUrl: resolvePublicAudioUrl(audioUrl)
    };

    if (syncData && syncData.trim() !== '') {
      try {
        updateData.syncData = JSON.parse(syncData);
      } catch (e) {
    reportServerError('src/lib/complete-project.ts#syncData', e);
        console.warn("[Finalize] Malformed syncData received, skipping update.");
      }
    }
    
    batch.set(projectRef, updateData, { merge: true });

    const notificationRef = firestore.collection('users').doc(userId).collection('notifications').doc('user_notifications');
    const notificationData = { 
      id: `done-${Date.now()}`, 
      message: `Your project "${projectName}" has been successfully generated!`, 
      timestamp: new Date().toISOString(), 
      read: false, 
      type: 'system' as const 
    };
    batch.set(notificationRef, { entries: FieldValue.arrayUnion(notificationData) }, { merge: true });

    await batch.commit();
    
    // Cleanup from correct RTDB Node
    await database.ref(`${rtdbPath}/${projectId}`).remove();
    
    try {
        const userDoc = await firestore.collection('users').doc(userId).get();
        const projectDoc = await projectRef.get();
        
        if (userDoc.exists && projectDoc.exists) {
            const userData = userDoc.data();
            const projectData = projectDoc.data();
            
            await sendProjectReadyEmailAction({
                name: userData?.name || 'Creator',
                email: userData?.email || '',
                projectName: projectData?.projectName || projectName,
                script: projectData?.script || '',
                characters: projectData?.characters || []
            });
        }
    } catch (emailError) {
    reportServerError('src/lib/complete-project.ts#email', emailError);
        console.error("Non-critical email dispatch failure:", emailError);
    }

    revalidatePath('/admin/pending');
    return { success: true, message: 'Project finalized and user notified.' };
  } catch (error: any) {
    reportServerError('src/lib/complete-project.ts', error);
    console.error("Finalize project error:", error);
    return { success: false, message: error.message };
  }
}
