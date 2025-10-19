import { Link } from "react-router-dom"

export default function Navbar() {
  return (
    <nav className="bg-gray-900 text-white p-4 shadow-md">
      <div className="container mx-auto flex justify-between items-center">
        <Link to="/" className="text-2xl font-bold">
          E-Shop
        </Link>
        <div className="flex gap-6">
          <Link to="/cart" className="hover:text-gray-300">
            🛒 Cart
          </Link>
          <Link to="/login" className="hover:text-gray-300">
            👤 Login
          </Link>
          <Link to="/register" className="hover:text-blue-300">Register</Link>
        </div>
      </div>
    </nav>
  )
}