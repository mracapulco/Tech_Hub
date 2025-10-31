import './globals.css';
import React from 'react';

export const metadata = {
  title: 'Tech Hub',
  description: 'Plataforma técnica multi-empresa',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-background text-text">
        {children}
      </body>
    </html>
  );
}