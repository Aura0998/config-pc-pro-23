
import { Button } from "@/components/ui/button";
import { Square } from "lucide-react";

type MotherboardSize = "atx" | "micro-atx" | "mini-itx" | null;

interface MotherboardSelectorProps {
  motherboardSize: MotherboardSize;
  onMotherboardSizeChange: (size: MotherboardSize) => void;
}

export default function MotherboardSelector({
  motherboardSize,
  onMotherboardSizeChange,
}: MotherboardSelectorProps) {
  const handleMotherboardSizeChange = (value: MotherboardSize) => {
    onMotherboardSizeChange(motherboardSize === value ? null : value);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold flex items-center gap-2 text-white">
        <Square className="w-6 h-6" />
        Tamaño de Placa Base
      </h2>
      <div className="flex justify-center gap-4">
        <Button
          variant={motherboardSize === "atx" ? "filterSelected" : "filter"}
          size="filter"
          onClick={() => handleMotherboardSizeChange("atx")}
          aria-label="ATX"
          title="ATX"
          className="bg-gradient-to-b from-gray-800 to-gray-900 hover:from-purple-900 hover:to-purple-950 flex items-center justify-center"
        >
          <div className="flex flex-col items-center">
            <span className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-300 via-white to-gray-300 drop-shadow-[0_0_2px_rgba(255,255,255,0.3)]" style={{
              textShadow: "0 0 10px rgba(255,255,255,0.5), 0 0 20px rgba(255,255,255,0.2)"
            }}>ATX</span>
          </div>
        </Button>
        <Button
          variant={motherboardSize === "micro-atx" ? "filterSelected" : "filter"}
          size="filter"
          onClick={() => handleMotherboardSizeChange("micro-atx")}
          aria-label="Micro-ATX"
          title="Micro-ATX"
          className="bg-gradient-to-b from-gray-800 to-gray-900 hover:from-purple-900 hover:to-purple-950 flex items-center justify-center"
        >
          <div className="flex flex-col items-center">
            <span className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-300 via-white to-gray-300 drop-shadow-[0_0_2px_rgba(255,255,255,0.3)]" style={{
              textShadow: "0 0 10px rgba(255,255,255,0.5), 0 0 20px rgba(255,255,255,0.2)"
            }}>MICRO-ATX</span>
          </div>
        </Button>
        <Button
          variant={motherboardSize === "mini-itx" ? "filterSelected" : "filter"}
          size="filter"
          onClick={() => handleMotherboardSizeChange("mini-itx")}
          aria-label="Mini-ITX"
          title="Mini-ITX"
          className="bg-gradient-to-b from-gray-800 to-gray-900 hover:from-purple-900 hover:to-purple-950 flex items-center justify-center"
        >
          <div className="flex flex-col items-center">
            <span className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-300 via-white to-gray-300 drop-shadow-[0_0_2px_rgba(255,255,255,0.3)]" style={{
              textShadow: "0 0 10px rgba(255,255,255,0.5), 0 0 20px rgba(255,255,255,0.2)"
            }}>MINI-ITX</span>
          </div>
        </Button>
      </div>
    </div>
  );
}
