import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface ConsentItem {
  id: string;
  label: string;
  checked: boolean;
}

interface ConsentCheckboxProps {
  items: ConsentItem[];
  onChange: (id: string, checked: boolean) => void;
}

export function ConsentCheckbox({ items, onChange }: ConsentCheckboxProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-foreground">
        以下の内容に同意してください
      </p>
      
      {items.map((item) => (
        <div key={item.id} className="flex items-start gap-3">
          <Checkbox
            id={item.id}
            checked={item.checked}
            onCheckedChange={(checked) => onChange(item.id, checked === true)}
            className="mt-1"
          />
          <Label 
            htmlFor={item.id} 
            className="text-sm text-muted-foreground leading-relaxed cursor-pointer"
          >
            {item.label}
          </Label>
        </div>
      ))}
    </div>
  );
}

// デフォルトの同意項目（業態によって変更可能）
export const DEFAULT_CONSENT_ITEMS = [
  {
    id: "consent-1",
    label: "代表者1名が人数分のチケットをまとめて購入することに同意します",
    checked: false,
  },
  {
    id: "consent-2",
    label: "利用料・飲食代・診察料などは別途発生する可能性があることを理解しています",
    checked: false,
  },
  {
    id: "consent-3",
    label: "本チケットは先頭付近に案内される権利であり、多少の待ち時間が発生する可能性があることを理解しています",
    checked: false,
  },
];
