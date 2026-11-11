import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://mpd-music.vercel.app'),
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    url: 'https://mpd-music.vercel.app/',
    siteName: '[MPD] MPD Music Studio',
    title: '[MPD] MPD Music Studio | 사운드 프로덕션 & 뮤직 커뮤니티',
    description: '바다와 숲이 펼쳐지는 3D 사운드 프로덕션 스튜디오와 뮤직 커뮤니티.',
  },
  title: '[MPD] MPD Music Studio | 사운드 프로덕션 & 뮤직 커뮤니티',
  description: '바다와 숲이 펼쳐지는 3D MPD 사운드 프로덕션 공간. 음악을 듣고, 악기를 연주하고, 뮤지션과 소통하세요.',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#0c0a09',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko" className="dark">
      <body className="antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
