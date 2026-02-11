import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { SignInButton, SignedIn, SignedOut, UserButton } from '@clerk/nextjs'
import Image from 'next/image'
import Link from 'next/link'

import { Github, KeyIcon } from 'lucide-react'
import { Button } from './ui/button'

export default function Header() {
  return (
    <header className="flex items-center justify-between px-6 py-4 border-b-2 border-gray-100">
      <div className="flex items-center space-x-4">
        <div className="flex items-center justify-center">
          <span className="text-gray-500 text-xl font-bold">
            <Image
              src="https://cipherstash.com/LogoOnly.png"
              alt="Logo"
              width={24}
              height={24}
            />
          </span>
        </div>
        <span className="text-4xl font-extralight text-gray-200">/</span>
        <h1 className="text-2xl font-mono">stash encryption</h1>
        <span className="text-4xl font-extralight text-gray-200">/</span>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Users</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/add-user">Add a user</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div className="flex items-center space-x-4">
        <div className="flex items-center justify-center">
          <SignedOut>
            <SignInButton>
              <Button variant="default">
                <KeyIcon /> Authenticate
              </Button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <UserButton />
          </SignedIn>
        </div>
      </div>
    </header>
  )
}
