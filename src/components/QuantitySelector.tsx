import { Button } from "@/components/ui/button";
import { Minus, Plus, Users } from "lucide-react";

interface QuantitySelectorProps {
  quantity: number;
  onChange: (quantity: number) => void;
  min?: number;
  max?: number;
  maxQuantity?: number;
  label?: string;
}

export function QuantitySelector({ 
  quantity, 
  onChange, 
  min = 1, 
  max = 10,
  maxQuantity,
  label = "人数を選択（代表者が人数分まとめて購入）"
}: QuantitySelectorProps) {
  const effectiveMax = maxQuantity ?? max;
  
  const decrease = () => {
    if (quantity > min) onChange(quantity - 1);
  };

  const increase = () => {
    if (quantity < effectiveMax) onChange(quantity + 1);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Users className="w-4 h-4" />
        <span>{label}</span>
      </div>
      
      <div className="flex items-center justify-center gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={decrease}
          disabled={quantity <= min}
          className="h-12 w-12 rounded-full"
        >
          <Minus className="w-5 h-5" />
        </Button>
        
        <div className="w-24 text-center">
          <span className="text-4xl font-bold text-foreground">{quantity}</span>
          <span className="text-lg text-muted-foreground ml-1">枚</span>
        </div>
        
        <Button
          variant="outline"
          size="icon"
          onClick={increase}
          disabled={quantity >= effectiveMax}
          className="h-12 w-12 rounded-full"
        >
          <Plus className="w-5 h-5" />
        </Button>
      </div>
      
      <p className="text-center text-sm text-muted-foreground">
        1〜{effectiveMax}枚まで選択可能
      </p>
    </div>
  );
}
