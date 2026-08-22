'use client'
 
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'
import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html>
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-center">
            <div className="flex flex-col items-center gap-4">
                <AlertTriangle className="h-24 w-24 text-destructive" />
                <h2 className="text-3xl font-semibold">Something went wrong!</h2>
                <p className="max-w-md text-muted-foreground">
                    An unrecoverable error occurred. Please try to refresh the page.
                </p>
                <Button onClick={reset} size="lg" className="mt-4">
                    Try again
                </Button>
            </div>
        </div>
      </body>
    </html>
  )
}
