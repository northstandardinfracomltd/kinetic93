with open('src/App.tsx', 'r') as f:
    content = f.read()

# First block: add reason with duration
old_add_1 = '''                                                      if (!current.includes(val)) {
                                                        const nextReasons = [...current, val];
                                                        updateFsmMission(t.id, m.id, {
                                                          reasons: nextReasons,
                                                          reason: nextReasons.join(", ")
                                                        });
                                                      }'''

new_add_1 = '''                                                      if (!current.includes(val)) {
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
                                                      }'''

assert old_add_1 in content, "old_add_1 not found"
content = content.replace(old_add_1, new_add_1, 1)

# Second block: add reason with duration
old_add_2 = '''                                                  if (!current.includes(val)) {
                                                    const nextReasons = [...current, val];
                                                    updateFsmMission(t.id, m.id, {
                                                      reasons: nextReasons,
                                                      reason: nextReasons.join(", ")
                                                    });
                                                  }'''

new_add_2 = '''                                                  if (!current.includes(val)) {
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
                                                  }'''

assert old_add_2 in content, "old_add_2 not found"
content = content.replace(old_add_2, new_add_2, 1)

# First block: option label with duration
old_option_1 = '''                                                        <option key={v.id} value={v.nom} disabled={isSelected}>
                                                          {v.nom} {isSelected ? "(Déjà ajoutée)" : ""}
                                                        </option>'''

new_option_1 = '''                                                        <option key={v.id} value={v.nom} disabled={isSelected}>
                                                          {v.nom}{v.dureePrestation ? ` (${v.dureePrestation} min)` : ''} {isSelected ? "(Déjà ajoutée)" : ""}
                                                        </option>'''

assert old_option_1 in content, "old_option_1 not found"
content = content.replace(old_option_1, new_option_1, 1)

# Second block: option label with duration
old_option_2 = '''                                                    <option key={v.id} value={v.nom} disabled={isSelected}>
                                                      {v.nom} {isSelected ? "(Déjà ajoutée)" : ""}
                                                    </option>'''

new_option_2 = '''                                                    <option key={v.id} value={v.nom} disabled={isSelected}>
                                                      {v.nom}{v.dureePrestation ? ` (${v.dureePrestation} min)` : ''} {isSelected ? "(Déjà ajoutée)" : ""}
                                                    </option>'''

assert old_option_2 in content, "old_option_2 not found"
content = content.replace(old_option_2, new_option_2, 1)

# First block: capsules with duration and removal updating duration
old_capsule_1 = '''                                                        {currentReasons.length > 0 ? (
                                                          currentReasons.map((reasonStr: string) => (
                                                            <span
                                                              key={reasonStr}
                                                              onClick={() => {
                                                                const nextReasons = currentReasons.filter(r => r !== reasonStr);
                                                                updateFsmMission(t.id, m.id, {
                                                                  reasons: nextReasons,
                                                                  reason: nextReasons.join(", ")
                                                                });
                                                              }}
                                                              style={{
                                                                fontFamily: "DefibeoMain, Civilprom, sans-serif",
                                                              }}
                                                              className="cursor-pointer inline-flex items-center rounded-full bg-white border border-slate-200 text-slate-800 text-[15px] px-3.5 py-1.5 font-medium hover:bg-[#8e1010] hover:border-[#8e1010] hover:text-white transition-all duration-150 select-none"
                                                              title="Cliquez pour supprimer"
                                                            >
                                                              {reasonStr}
                                                            </span>
                                                          ))
                                                        ) : null}'''

new_capsule_1 = '''                                                        {currentReasons.length > 0 ? (
                                                          currentReasons.map((reasonStr: string) => {
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
                                                        ) : null}'''

assert old_capsule_1 in content, "old_capsule_1 not found"
content = content.replace(old_capsule_1, new_capsule_1, 1)

# Second block: capsules with duration
old_capsule_2 = '''                                                  {currentReasons.length > 0 ? (
                                                    currentReasons.map((reasonStr: string) => (
                                                      <span
                                                        key={reasonStr}
                                                        onClick={() => {
                                                          const nextReasons = currentReasons.filter(r => r !== reasonStr);
                                                          updateFsmMission(t.id, m.id, {
                                                            reasons: nextReasons,
                                                            reason: nextReasons.join(", ")
                                                          });
                                                        }}
                                                        style={{
                                                          fontFamily: "DefibeoMain, Civilprom, sans-serif",
                                                        }}
                                                        className="cursor-pointer inline-flex items-center rounded-full bg-white border border-slate-200 text-slate-800 text-[15px] px-3.5 py-1.5 font-medium hover:bg-[#8e1010] hover:border-[#8e1010] hover:text-white transition-all duration-150 select-none"
                                                        title="Cliquez pour supprimer"
                                                      >
                                                        {reasonStr}
                                                      </span>
                                                    ))
                                                  ) : (
                                                    null
                                                  )}'''

new_capsule_2 = '''                                                  {currentReasons.length > 0 ? (
                                                    currentReasons.map((reasonStr: string) => {
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
                                                  ) : (
                                                    null
                                                  )}'''

assert old_capsule_2 in content, "old_capsule_2 not found"
content = content.replace(old_capsule_2, new_capsule_2, 1)

with open('src/App.tsx', 'w') as f:
    f.write(content)
print("Updated App.tsx successfully")
