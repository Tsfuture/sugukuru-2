import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  max = 500,
  maxQuantity,
  label = "人数を選択（代表者が人数分まとめて購入）"
}: QuantitySelectorProps) {
  const effectiveMax = maxQuantity ?? max;
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(String(quantity));
  
  const decrease = () => {
    if (quantity > min) onChange(quantity - 1);
  };

  const increase = () => {
    if (quantity < effectiveMax) onChange(quantity + 1);
  };

  // クランプ関数: min〜max の範囲に収める
  const clamp = (value: number) => Math.max(min, Math.min(effectiveMax, value));

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleInputBlur = () => {
    const parsed = parseInt(inputValue, 10);
    if (!isNaN(parsed)) {
      onChange(clamp(parsed));
    }
    setInputValue(String(clamp(parsed || quantity)));
    setIsEditing(false);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleInputBlur();
    } else if (e.key === "Escape") {
      setInputValue(String(quantity));
      setIsEditing(false);
    }
  };

  const handleQuantityClick = () => {
    setInputValue(String(quantity));
    setIsEditing(true);
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
        
        <div className="w-28 text-center">
          {isEditing ? (
            <div className="flex items-center justify-center">
              <Input
                type="number"
                min={min}
                max={effectiveMax}
                value={inputValue}
                onChange={handleInputChange}
                onBlur={handleInputBlur}
                onKeyDown={handleInputKeyDown}
                autoFocus
                className="w-20 text-center text-2xl font-bold h-12 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-lg text-muted-foreground ml-1">枚</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleQuantityClick}
              className="cursor-pointer hover:opacity-70 transition-opacity"
              title="クリックして数量を入力"
            >
              <span className="text-4xl font-bold text-foreground">{quantity}</span>
              <span className="text-lg text-muted-foreground ml-1">枚</span>
            </button>
          )}
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
        1〜{effectiveMax}枚まで選択可能（数字をタップで直接入力）
      </p>
    </div>
  );
}
