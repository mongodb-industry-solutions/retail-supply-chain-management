import "./globals.css";
import { Providers } from "./providers";
import Navbar from "../components/layout/Navbar";
import StepperWrapper from "../components/layout/StepperWrapper";

export const metadata = {
  title: "Intelligent Supplier Hub",
  description: "MongoDB Retail Supply Chain Management Demo",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Navbar />
          <main className="container">
            <div style={{ padding: "12px 0 0" }}>
              <StepperWrapper />
            </div>
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
