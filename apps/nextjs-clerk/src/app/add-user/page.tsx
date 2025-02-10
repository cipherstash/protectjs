import Header from '@/components/Header'
import AddUserForm from '@/components/AddUserForm'

export default function AddUser() {
  return (
    <main className="min-h-screen flex flex-col">
      <Header />
      <div className="flex-grow p-8">
        <h2 className="text-2xl font-bold mb-6">Add new user</h2>
        <AddUserForm />
      </div>
    </main>
  )
}
