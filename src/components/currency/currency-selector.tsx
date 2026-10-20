import * as React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { CURRENCY_INFO, getCurrencySymbol } from '@/domain/money/money';
import { cn } from '@/lib/utils';

export interface CurrencySelectorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  label?: string;
}

const POPULAR_CURRENCY_CODES = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'CAD', 'AUD', 'SGD'];

export function CurrencySelector({
  value,
  onChange,
  disabled = false,
  className,
  label = 'Select currency',
}: CurrencySelectorProps) {
  const [open, setOpen] = React.useState(false);

  const selectedCode = (value || 'USD').toUpperCase();
  const selectedInfo = CURRENCY_INFO[selectedCode];
  const selectedSymbol = getCurrencySymbol(selectedCode);

  const popularList = POPULAR_CURRENCY_CODES.map((code) => ({
    code,
    name: CURRENCY_INFO[code]?.name ?? code,
    symbol: CURRENCY_INFO[code]?.symbol ?? code,
  }));

  const allList = Object.entries(CURRENCY_INFO).map(([code, info]) => ({
    code,
    name: info.name,
    symbol: info.symbol,
  }));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal text-left h-10 px-3 bg-background hover:bg-muted/40 border-input',
            className
          )}
        >
          <div className="flex items-center gap-2 truncate">
            <span className="font-semibold text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground border">
              {selectedSymbol}
            </span>
            <span className="font-medium text-foreground">{selectedCode}</span>
            <span className="text-muted-foreground text-xs truncate">
              {selectedInfo?.name}
            </span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(300px,calc(100vw-2rem))] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search currency..." className="h-9" />
          <CommandList className="max-h-[280px]">
            <CommandEmpty>No currency found.</CommandEmpty>
            
            <CommandGroup heading="Popular Currencies">
              {popularList.map((item) => (
                <CommandItem
                  key={`popular-${item.code}`}
                  value={`${item.code} ${item.name} ${item.symbol}`}
                  onSelect={() => {
                    onChange(item.code);
                    setOpen(false);
                  }}
                  className="flex items-center justify-between cursor-pointer py-2"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-xs w-6 text-center text-muted-foreground bg-muted/60 py-0.5 rounded">
                      {item.symbol}
                    </span>
                    <span className="font-semibold text-sm">{item.code}</span>
                    <span className="text-xs text-muted-foreground truncate max-w-[140px]">
                      {item.name}
                    </span>
                  </div>
                  <Check
                    className={cn(
                      'h-4 w-4 text-primary',
                      selectedCode === item.code ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="All Currencies">
              {allList.map((item) => (
                <CommandItem
                  key={`all-${item.code}`}
                  value={`${item.code} ${item.name} ${item.symbol}`}
                  onSelect={() => {
                    onChange(item.code);
                    setOpen(false);
                  }}
                  className="flex items-center justify-between cursor-pointer py-2"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-xs w-6 text-center text-muted-foreground bg-muted/60 py-0.5 rounded">
                      {item.symbol}
                    </span>
                    <span className="font-semibold text-sm">{item.code}</span>
                    <span className="text-xs text-muted-foreground truncate max-w-[140px]">
                      {item.name}
                    </span>
                  </div>
                  <Check
                    className={cn(
                      'h-4 w-4 text-primary',
                      selectedCode === item.code ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default CurrencySelector;
