const fs = require('fs');
let code = fs.readFileSync('src/components/history/purchase-history.tsx', 'utf8');

const oldFallback = "if (!product) { return <Card className=\"overflow-hidden rounded-[2rem] border-destructive/20 shadow-lg bg-card\"><CardContent className=\"p-6 flex flex-col items-center text-center text-muted-foreground opacity-50\"><Package className=\"h-8 w-8 mb-2\" /><p className=\"text-sm font-bold\">Product Unavailable</p><p className=\"text-xs\">ID: {order.productId}</p></CardContent></Card>; }";

const newFallback = `if (!product) { 
        return (
            <Card className="overflow-hidden rounded-[2rem] border-destructive/20 shadow-lg bg-card transition-all opacity-80">
                <CardContent className="p-0">
                    <div className="flex flex-col">
                        <div className="relative h-48 w-full bg-muted flex flex-col items-center justify-center text-muted-foreground">
                            <Package className="h-10 w-10 mb-2 opacity-50" />
                            <p className="text-sm font-bold">Product Removed</p>
                        </div>
                        <div className="p-5 flex flex-col gap-4">
                            <div>
                                <h3 className="font-bold text-lg line-clamp-2 text-foreground">
                                    {order.productTitle || 'Unknown Product'}
                                </h3>
                                <p className="text-xs text-muted-foreground mt-1">This asset has been removed by the seller.</p>
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-2 mt-2 pt-4 border-t border-border/50">
                                <Badge variant="secondary" className="bg-muted text-muted-foreground">
                                    {order.paymentMethod === 'free' ? 'Free' : (order.paymentMethod === 'credits' ? \`💎 \${order.amount / 100}\` : \`₹\${order.amount / 100}\`)}
                                </Badge>
                                <div className="text-xs text-muted-foreground flex items-center">
                                    <Clock className="w-3 h-3 mr-1" />
                                    {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'N/A'}
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        ); 
    }`;

code = code.replace(oldFallback, newFallback);
fs.writeFileSync('src/components/history/purchase-history.tsx', code);
