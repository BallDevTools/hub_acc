"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchAllOptions } from "@/lib/api";

export function OwnerSelect({ value, onChange, id = "owner" }: { value: string; onChange: (value: string) => void; id?: string }) {
  const owners = useQuery({
    queryKey: ["options", "/api/owners"],
    queryFn: () => fetchAllOptions<{ id: string; name: string }>("/api/owners"),
  });
  return (
    <select id={id} className="field" required value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">— เลือกเจ้าของบัญชี —</option>
      {owners.data?.map((owner) => (
        <option key={owner.id} value={owner.id}>
          {owner.name}
        </option>
      ))}
    </select>
  );
}
