import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index";
import Buy from "./pages/Buy";
import Auth from "./pages/Auth";
import CardSetup from "./pages/CardSetup";
import TempTicket from "./pages/TempTicket";
import Success from "./pages/Success";
import Tokusho from "./pages/Tokusho";
import MyPage from "./pages/MyPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/buy" element={<Buy />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/card-setup" element={<CardSetup />} />
            <Route path="/temp-ticket" element={<TempTicket />} />
            <Route path="/success" element={<Success />} />
            <Route path="/tokusho" element={<Tokusho />} />
            <Route path="/mypage" element={<MyPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
