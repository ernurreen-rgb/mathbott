import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-math animate-gradient p-4">
      <div className="max-w-md w-full bg-white/90 backdrop-blur-sm rounded-2xl shadow-2xl p-6 text-center border border-white/30">
        <div className="text-6xl mb-4">🔍</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Бет табылмады
        </h1>
        <p className="text-gray-600 mb-4">
          Сіз іздеген бет жоқ немесе ол жойылған болуы мүмкін.
        </p>
        <Link
          href="/"
          className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors font-semibold"
        >
          Басты бетке оралу
        </Link>
      </div>
    </div>
  );
}

