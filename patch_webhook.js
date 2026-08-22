const fs = require('fs');
let code = fs.readFileSync('src/app/api/webhook/razorpay/route.ts', 'utf8');

const webhookInsert = `
            const items = orderData?.items || [];
`;
const webhookFetch = `
            const items = orderData?.items || [];
            
            // Pre-fetch products for snapshotting inside history
            const productIds = items.map((i: any) => i.productId);
            let productsById: Record<string, any> = {};
            if (productIds.length > 0) {
                const productDocs = await transaction.getAll(...productIds.map((id: string) => firestore.collection('products').doc(id)));
                productDocs.forEach((doc: any) => {
                    if (doc.exists) {
                        productsById[doc.id] = doc.data();
                    }
                });
            }
`;
code = code.replace(webhookInsert, webhookFetch);

const webhookReplace2 = `
                    paymentMethod: 'cash',
                    paymentId,
                    createdAt,
                });`;
const webhookFetch2 = `
                    paymentMethod: 'cash',
                    paymentId,
                    createdAt,
                    productSnapshot: productsById[item.productId] || null,
                });`;
code = code.replace(webhookReplace2, webhookFetch2);
fs.writeFileSync('src/app/api/webhook/razorpay/route.ts', code);
