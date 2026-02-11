import { Toaster } from '@/components/ui/toaster'
import { ClerkProvider } from '@clerk/nextjs'
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Stash Encryption + Next.js + Clerk',
  description: 'An example of using Stash Encryption with Next.js and Clerk',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="antialiased">
          <main>{children}</main>
          <Toaster />
        </body>
      </html>
    </ClerkProvider>
  )
}
