"use client"

import * as React from "react"

const WebSkinContext = React.createContext<string | undefined>(undefined)

function WebSkinProvider({
  value,
  children,
}: {
  value: string | undefined
  children: React.ReactNode
}) {
  return <WebSkinContext.Provider value={value}>{children}</WebSkinContext.Provider>
}

function PortalSkin({ children }: { children: React.ReactNode }) {
  const webSkin = React.useContext(WebSkinContext)

  if (webSkin === undefined) {
    return <>{children}</>
  }

  return (
    <div className="contents text-foreground" data-web-skin={webSkin} data-slot="portal-skin">
      {children}
    </div>
  )
}

export { PortalSkin, WebSkinProvider }
