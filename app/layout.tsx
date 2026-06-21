import '@/index.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'わたしの政治 運営管理 / admin.seijiselect.jp',
  description: 'seijiselect.jp 運営管理（プロトタイプ）',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang='ja' suppressHydrationWarning>
      <body>
        <div className='flex min-h-screen flex-col bg-[#f3f4f6]'>
          <header className='flex items-center gap-2 border-b border-gray-200 bg-slate-900 px-4 py-3 text-white'>
            <span className='text-lg'>🏛️</span>
            <span className='text-sm font-bold'>わたしの政治 運営管理</span>
            <span className='ml-2 rounded-full bg-slate-700 px-2 py-0.5 text-[10px] font-medium'>admin.seijiselect.jp</span>
            <span className='ml-auto rounded-full bg-rose-500/90 px-2 py-0.5 text-[10px] font-semibold'>プロトタイプ</span>
          </header>
          <main className='flex-1'>{children}</main>
        </div>
      </body>
    </html>
  )
}
