"use client";

import NavMenu from "@/lib/ui/NavMenu";
import { css } from "@/lib/ui/driver/tokens";
import { SelfProfileView } from "@/lib/ui/driver/SelfProfileView";

export default function ProfilePage() {
  return (
    <div style={css.page}>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, gap: 12 }}>
        <div>
          <h1 style={css.heading}>Profile</h1>
          <p style={css.subheading}>Your personal details.</p>
        </div>
        <NavMenu />
      </div>

      <SelfProfileView />
    </div>
  );
}
