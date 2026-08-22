const fs = require('fs');
let code = fs.readFileSync('src/app/store/checkout/actions.ts', 'utf8');

// For free order:
code = code.replace(
  "paymentId: `free_order_${orderRef.id}`, // A unique identifier\n                createdAt: createdAt,\n            });",
  "paymentId: `free_order_${orderRef.id}`, // A unique identifier\n                createdAt: createdAt,\n                productSnapshot: productsById.get(item.id) || null,\n            });"
);

// For credit order:
// Add product fetching before transaction
const creditInsertPoint = "const userRef = firestore.collection('users').doc(user.uid);";
const creditProductsFetch = `
        const productIds = cartItems.map(item => item.id);
        const productRefs = productIds.length > 0 ? productIds.map(id => firestore.collection('products').doc(id)) : [];
        const productDocs = productIds.length > 0 ? await firestore.getAll(...productRefs) : [];
        const productsById = new Map<string, any>(productDocs.map((doc: any) => [doc.id, doc.data()]));
        
        const userRef = firestore.collection('users').doc(user.uid);`;
code = code.replace(creditInsertPoint, creditProductsFetch);

code = code.replace(
  "paymentId: lastOrderId,\n                    createdAt: createdAt,\n                });",
  "paymentId: lastOrderId,\n                    createdAt: createdAt,\n                    productSnapshot: productsById.get(item.id) || null,\n                });"
);

fs.writeFileSync('src/app/store/checkout/actions.ts', code);
