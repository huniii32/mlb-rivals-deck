export function Num({
  value, onChange, width = 56, placeholder,
}: {
  value: number | "";
  onChange: (v: number | "") => void;
  width?: number;
  placeholder?: string;
}) {
  return (
    <input
      type="number"
      value={value}
      placeholder={placeholder}
      style={{ width }}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === "" ? "" : Number(v));
      }}
    />
  );
}
