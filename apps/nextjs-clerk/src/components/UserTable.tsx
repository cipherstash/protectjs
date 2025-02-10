'use client'

import { InfoIcon } from 'lucide-react'
import type { EncryptedUser } from '../app/page'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export default function UserTable({
  users,
  email = 'Your user',
}: { users: EncryptedUser[]; email?: string }) {
  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium">{user.name}</TableCell>
              <TableCell className="flex items-center gap-2">
                <span className="truncate ... max-w-[300px] block">
                  {user.email}
                </span>
                {!user.authorized && (
                  <TooltipProvider delayDuration={50}>
                    <Tooltip>
                      <TooltipTrigger>
                        <InfoIcon className="ml-2 h-5 w-5 text-red-500" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>
                          {email} is not authorized to decrypt this user's
                          email.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </TableCell>
              <TableCell>{user.role}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
