const fs = require('fs');
let code = fs.readFileSync('src/components/history/purchase-history.tsx', 'utf8');

const fetchProductOld = `        const fetchProduct = async () => {
            setIsLoadingProduct(true);
            try {
                // SECURE: Use server action instead of direct Firestore fetch to bypass strict read rules
                const { product: fetchedProduct } = await getProductDetails(order.productId, activeUid);
                if (fetchedProduct) {
                    setProduct(fetchedProduct);
                }
            } catch (e) {
                console.error("Purchase detail fetch failed:", e);
            } finally {
                setIsLoadingProduct(false);
            }
        };`;

const fetchProductNew = `        const fetchProduct = async () => {
            setIsLoadingProduct(true);
            try {
                if (order.productSnapshot) {
                    let previews = order.productSnapshot.previews || [];
                    if (previews && !Array.isArray(previews)) {
                        previews = Object.values(previews);
                    }
                    const previewImage = previews.find((p: any) => p.type === 'image')?.url || order.productSnapshot.previewImage || '';
                    setProduct({ 
                        id: order.productId, 
                        ...order.productSnapshot,
                        previews: previews,
                        previewImage: previewImage
                    } as StoreProduct);
                } else {
                    const { product: fetchedProduct } = await getProductDetails(order.productId, activeUid);
                    if (fetchedProduct) {
                        setProduct(fetchedProduct);
                    }
                }
            } catch (e) {
                console.error("Purchase detail fetch failed:", e);
            } finally {
                setIsLoadingProduct(false);
            }
        };`;
code = code.replace(fetchProductOld, fetchProductNew);

const fetchScriptOld = `    const handleFetchScriptContent = async () => {
        if (fullScript) return fullScript;
        if (!activeUid) return null;
        setIsLoadingScript(true);
        try {
            // SECURE: Retrieve directly from Firestore string field via Server Action
            const result = await getSecureDownloadUrls(order.productId, activeUid);
            if (result.success) {`;

const fetchScriptNew = `    const handleFetchScriptContent = async () => {
        if (fullScript) return fullScript;
        if (!activeUid) return null;
        setIsLoadingScript(true);
        try {
            if (order.productSnapshot && order.productSnapshot.fullScriptContent) {
                setFullScript(order.productSnapshot.fullScriptContent);
                return order.productSnapshot.fullScriptContent;
            }
            // SECURE: Retrieve directly from Firestore string field via Server Action
            const result = await getSecureDownloadUrls(order.productId, activeUid);
            if (result.success) {`;
code = code.replace(fetchScriptOld, fetchScriptNew);

const toggleFilesOld = `    const handleToggleFiles = async (open: boolean) => {
        if (!open) return;
        if (downloadableFiles || fullScript) return;
        if (!activeUid) return;
        setIsLoadingFiles(true);

        const result = await getSecureDownloadUrls(order.productId, activeUid);
        if (result.success) {
            if (result.files) setDownloadableFiles(result.files);
            if (result.fullScriptContent) setFullScript(result.fullScriptContent);
        } else {
            toast({ variant: 'destructive', title: 'Access Denied', description: result.message });
        }
        setIsLoadingFiles(false);
    };`;

const toggleFilesNew = `    const handleToggleFiles = async (open: boolean) => {
        if (!open) return;
        if (downloadableFiles || fullScript) return;
        if (!activeUid) return;
        setIsLoadingFiles(true);

        if (order.productSnapshot) {
            if (order.productSnapshot.downloadableFiles) setDownloadableFiles(order.productSnapshot.downloadableFiles);
            if (order.productSnapshot.fullScriptContent) setFullScript(order.productSnapshot.fullScriptContent);
            setIsLoadingFiles(false);
            return;
        }

        const result = await getSecureDownloadUrls(order.productId, activeUid);
        if (result.success) {
            if (result.files) setDownloadableFiles(result.files);
            if (result.fullScriptContent) setFullScript(result.fullScriptContent);
        } else {
            toast({ variant: 'destructive', title: 'Access Denied', description: result.message });
        }
        setIsLoadingFiles(false);
    };`;
code = code.replace(toggleFilesOld, toggleFilesNew);

fs.writeFileSync('src/components/history/purchase-history.tsx', code);
