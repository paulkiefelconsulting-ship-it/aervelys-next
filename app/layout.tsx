import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "AERVELYS NEXT | Command Center", description: "AERVELYS NEXT – Airline-Management-Demo" };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="de"><body>{children}</body></html>; }
