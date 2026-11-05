import type { Metadata } from 'next';
import './globals.css';
import { AppProvider } from '../context/AppContext';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';

export const metadata: Metadata = {
  title: 'Shotistry (شوتيستري) — استوديو تصوير المنتجات التجاري بالذكاء الاصطناعي',
  description:
    'حول صور منتجاتك العادية بالهاتف إلى جلسات تصوير إعلانية استوديو احترافية في ثوانٍ. مخصص لمتاجر سلة، زد، وإنستغرام في السعودية ومصر.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-screen flex flex-col bg-dark-950 text-gray-100 antialiased selection:bg-brand-500 selection:text-white">
        <AppProvider>
          <Navbar />
          <main className="flex-1">{children}</main>
          <Footer />
        </AppProvider>
      </body>
    </html>
  );
}

