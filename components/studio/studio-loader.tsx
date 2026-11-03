'use client'

import dynamic from 'next/dynamic'

const StudioApp = dynamic(() => import('./studio-app'), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh items-center justify-center bg-neutral-950 text-sm text-amber-200">MPD Music Studio 준비 중...</div>
  ),
})

export function StudioLoader() {
  return <StudioApp />
}
