
'use server';

import { z } from 'zod';
import { initializeFirebase } from '@/firebase/server';
import type { Product, ProductPreview } from '@/lib/types';
import { sendToTelegram } from '@/lib/telegram-logger';
import { escapeHtml } from '@/lib/utils';

const AddScriptSchema = z.object({
  title: z.string().min(5),
  description: z.string().min(20),
  price: z.coerce.number().min(0),
  scriptContent: z.string().min(100),
  thumbnailUrl: z.string(),
  scriptFileUrl: z.string().optional(),
  scriptPreviewUrl: z.string().optional(),
});

export async function addScriptAction(
    input: z.infer<typeof AddScriptSchema>,
    userId: string,
    sellerName: string,
): Promise<{ success: boolean; message: string; }> {
  
  const validation = AddScriptSchema.safeParse(input);
  if (!validation.success) {
      return { success: false, message: "Script validation failed." };
  }
  
  const { database, firestore } = initializeFirebase();
  const { title, description, price, scriptContent, thumbnailUrl, scriptFileUrl, scriptPreviewUrl } = validation.data;

  try {
    const productPreviews: ProductPreview[] = [{
        type: 'image',
        url: thumbnailUrl
    }];

    const productId = firestore.collection('products').doc().id;

    const firestoreProductData: Omit<Product, 'id'> = {
        title,
        description: description,
        price,
        productType: "Hand Written Script",
        isOneTimePurchase: true,
        sellerId: userId,
        status: 'pending',
        createdAt: new Date().toISOString(),
        previews: productPreviews,
        downloadableFiles: scriptFileUrl ? [{ fileName: 'Source Script', url: scriptFileUrl }] : [],
        scriptPreviewUrl: scriptPreviewUrl || null,
        fullScriptContent: scriptContent, 
        characterCount: scriptContent.length,
        likes: 0,
        sellerName: sellerName,
    };
    
    await database.ref(`pendingProducts/${productId}`).set({ ...firestoreProductData, id: productId });
    
    await sendToTelegram(`✍️ *New Script for Approval*\n<b>Seller:</b> ${sellerName}\n<b>Product:</b> ${title}`);

    return { success: true, message: "Script submitted for approval!" };

  } catch (error: any) {
    console.error("Error submitting script:", error);
    await sendToTelegram(`🚨 <b>Script Submission FAILED</b>\n<b>Seller:</b> ${sellerName}\n<b>Error:</b> <pre>${escapeHtml(error.message)}</pre>`);
    return { success: false, message: error.message };
  }
}
