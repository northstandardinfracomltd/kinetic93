with open('src/App.tsx', 'r') as f:
    lines = f.readlines()

# 1. Update lines 7796:7803
print("Line 7797:", lines[7796])
lines[7796:7803] = [
'''                                                      if (!current.includes(val)) {
                                                        const nextReasons = [...current, val];
                                                        let totalDuree = 0;
                                                        for (const r of nextReasons) {
                                                          const match = variables.find((v: any) => v.category === "Modèle Raison Prestation" && v.nom === r);
                                                          if (match?.dureePrestation) totalDuree += Number(match.dureePrestation);
                                                        }
                                                        updateFsmMission(t.id, m.id, {
                                                          reasons: nextReasons,
                                                          reason: nextReasons.join(", "),
                                                          dureePrestation: totalDuree > 0 ? totalDuree : undefined
                                                        });
                                                      }
'''
]

content = ''.join(lines)
lines = content.splitlines(keepends=True)

# 2. Find option 1
for idx, l in enumerate(lines):
    if '{v.nom} {isSelected ? "(Déjà ajoutée)" : ""}' in l and idx < 8000:
        lines[idx] = l.replace('{v.nom} {isSelected ? "(Déjà ajoutée)" : ""}', '{v.nom}{v.dureePrestation ? ` (${v.dureePrestation} min)` : \'\'} {isSelected ? "(Déjà ajoutée)" : ""}')
        break

# 3. Find capsule 1
for idx, l in enumerate(lines):
    if 'currentReasons.map((reasonStr: string) => (' in l and idx < 8000:
        # replace the map block
        end_idx = idx
        while end_idx < len(lines) and '))' not in lines[end_idx]:
            end_idx += 1
        end_idx += 1
        lines[idx:end_idx] = [
'''                                                        currentReasons.map((reasonStr: string) => {
                                                          const matchVar = variables.find((v: any) => v.category === "Modèle Raison Prestation" && v.nom === reasonStr);
                                                          return (
                                                            <span
                                                              key={reasonStr}
                                                              onClick={() => {
                                                                const nextReasons = currentReasons.filter(r => r !== reasonStr);
                                                                let totalDuree = 0;
                                                                for (const r of nextReasons) {
                                                                  const match = variables.find((v: any) => v.category === "Modèle Raison Prestation" && v.nom === r);
                                                                  if (match?.dureePrestation) totalDuree += Number(match.dureePrestation);
                                                                }
                                                                updateFsmMission(t.id, m.id, {
                                                                  reasons: nextReasons,
                                                                  reason: nextReasons.join(", "),
                                                                  dureePrestation: totalDuree > 0 ? totalDuree : undefined
                                                                });
                                                              }}
                                                              style={{
                                                                fontFamily: "DefibeoMain, Civilprom, sans-serif",
                                                              }}
                                                              className="cursor-pointer inline-flex items-center rounded-full bg-white border border-slate-200 text-slate-800 text-[15px] px-3.5 py-1.5 font-medium hover:bg-[#8e1010] hover:border-[#8e1010] hover:text-white transition-all duration-150 select-none"
                                                              title="Cliquez pour supprimer"
                                                            >
                                                              {reasonStr}{matchVar?.dureePrestation ? ` (${matchVar.dureePrestation} min)` : ''}
                                                            </span>
                                                          );
                                                        })
'''
        ]
        break

content = ''.join(lines)
lines = content.splitlines(keepends=True)

# 4. Update second block add
for idx, l in enumerate(lines):
    if 'if (!current.includes(val)) {' in l and idx > 8000:
        end_idx = idx
        while end_idx < len(lines) and 'e.target.value = "";' not in lines[end_idx]:
            end_idx += 1
        lines[idx:end_idx] = [
'''                                                  if (!current.includes(val)) {
                                                    const nextReasons = [...current, val];
                                                    let totalDuree = 0;
                                                    for (const r of nextReasons) {
                                                      const match = variables.find((v: any) => v.category === "Modèle Raison Prestation" && v.nom === r);
                                                      if (match?.dureePrestation) totalDuree += Number(match.dureePrestation);
                                                    }
                                                    updateFsmMission(t.id, m.id, {
                                                      reasons: nextReasons,
                                                      reason: nextReasons.join(", "),
                                                      dureePrestation: totalDuree > 0 ? totalDuree : undefined
                                                    });
                                                  }
'''
        ]
        break

content = ''.join(lines)
lines = content.splitlines(keepends=True)

# 5. Second option
for idx, l in enumerate(lines):
    if '{v.nom} {isSelected ? "(Déjà ajoutée)" : ""}' in l and idx > 8000:
        lines[idx] = l.replace('{v.nom} {isSelected ? "(Déjà ajoutée)" : ""}', '{v.nom}{v.dureePrestation ? ` (${v.dureePrestation} min)` : \'\'} {isSelected ? "(Déjà ajoutée)" : ""}')
        break

# 6. Second capsule
for idx, l in enumerate(lines):
    if 'currentReasons.map((reasonStr: string) => (' in l and idx > 8000:
        end_idx = idx
        while end_idx < len(lines) and '))' not in lines[end_idx]:
            end_idx += 1
        end_idx += 1
        lines[idx:end_idx] = [
'''                                                    currentReasons.map((reasonStr: string) => {
                                                      const matchVar = variables.find((v: any) => v.category === "Modèle Raison Prestation" && v.nom === reasonStr);
                                                      return (
                                                        <span
                                                          key={reasonStr}
                                                          onClick={() => {
                                                            const nextReasons = currentReasons.filter(r => r !== reasonStr);
                                                            let totalDuree = 0;
                                                            for (const r of nextReasons) {
                                                              const match = variables.find((v: any) => v.category === "Modèle Raison Prestation" && v.nom === r);
                                                              if (match?.dureePrestation) totalDuree += Number(match.dureePrestation);
                                                            }
                                                            updateFsmMission(t.id, m.id, {
                                                              reasons: nextReasons,
                                                              reason: nextReasons.join(", "),
                                                              dureePrestation: totalDuree > 0 ? totalDuree : undefined
                                                            });
                                                          }}
                                                          style={{
                                                            fontFamily: "DefibeoMain, Civilprom, sans-serif",
                                                          }}
                                                          className="cursor-pointer inline-flex items-center rounded-full bg-white border border-slate-200 text-slate-800 text-[15px] px-3.5 py-1.5 font-medium hover:bg-[#8e1010] hover:border-[#8e1010] hover:text-white transition-all duration-150 select-none"
                                                          title="Cliquez pour supprimer"
                                                        >
                                                          {reasonStr}{matchVar?.dureePrestation ? ` (${matchVar.dureePrestation} min)` : ''}
                                                        </span>
                                                      );
                                                    })
'''
        ]
        break

with open('src/App.tsx', 'w') as f:
    f.writelines(lines)
print("Finished updating App.tsx successfully!")
