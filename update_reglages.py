import re

with open('src/components/PublicPortal.tsx') as f:
    text = f.read()

start_marker = '{/* ----------------- TAB 5: LOCALISATION ----------------- */}'
end_marker = '/* ----------------- IF TECHNICIAN IS NOT LOGGED IN STATE (PUBLIC VIEWPORTS) ----------------- */'

start_idx = text.find(start_marker)
end_idx = text.find(end_marker)

assert start_idx != -1, 'start_marker not found'
assert end_idx != -1, 'end_marker not found'

# Between start_idx and end_idx, find where the tab begins and closes
# In existing code:
# {/* ----------------- TAB 5: LOCALISATION ----------------- */}
# {activeTab === "localisation" && (
#   <div ... id="tab-localisation-screen">
#     ...
#   </div>
# )}
# </div>
# </div>
# ) : (

# Let's inspect the text around end_idx
prefix_to_replace = text[start_idx:end_idx]
# We want to replace from start_marker down to the closing of activeTab === "localisation"
# Let's verify what comes right before end_marker
assert 'id="tab-localisation-screen"' in prefix_to_replace

new_block = '''{/* ----------------- TAB 5: LOCALISATION (RÉGLAGES) ----------------- */}
              {activeTab === "localisation" && (
                <div
                  className="space-y-6 pb-16 animate-fadeIn text-left"
                  id="tab-localisation-screen"
                >
                  <style>{`
                    #tab-localisation-screen input,
                    #tab-localisation-screen select,
                    #tab-localisation-screen label,
                    #tab-localisation-screen input::placeholder {
                      font-family: var(--font-sans), "Civilprom", "DefibeoMain", sans-serif !important;
                    }
                    #tab-localisation-screen input::placeholder {
                      font-size: 18px !important;
                      color: #9ca3af !important;
                    }
                  `}</style>

                  {/* Titre Que souhaitez-vous faire ? */}
                  <div>
                    <h2
                      style={{
                        fontSize: "32px",
                        fontFamily: "'Alternative', 'DefibeoAlternative', 'Gochi', cursive, sans-serif",
                        color: "#000000",
                        cursor: "default",
                        letterSpacing: "-0.02em",
                        paddingTop: "16px",
                        paddingBottom: "16px",
                        margin: 0,
                      }}
                    >
                      {t("Que souhaitez-vous faire ?")}
                    </h2>

                    {/* Nuage de boutons */}
                    <div className="flex flex-wrap gap-3 sm:gap-3.5 items-center">
                      {[
                        { key: "pointage", label: "Pointage" },
                        { key: "localisation", label: "Localisation" },
                        { key: "adresse", label: "Adresse" },
                        { key: "signature", label: "Signature" },
                        { key: "apparence", label: "Apparence" },
                        { key: "installer", label: "Installer l’app" },
                        { key: "calendar", label: "Google Calendar" },
                      ].map((sec) => {
                        const isSelected = activeSettingsSection === sec.key;
                        return (
                          <button
                            key={sec.key}
                            type="button"
                            onClick={() =>
                              setActiveSettingsSection((prev) =>
                                prev === sec.key ? null : sec.key,
                              )
                            }
                            style={{
                              fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                              fontSize: "18px",
                              fontWeight: 600,
                              borderRadius: "14px",
                              padding: "12px 18px",
                              backgroundColor: isSelected ? "#000000" : "#ffffff",
                              color: isSelected ? "#ffffff" : "rgb(0, 0, 0)",
                              border: isSelected ? "1px solid #000000" : "1px solid #dadada",
                              boxShadow: isSelected
                                ? "rgba(0, 0, 0, 0.16) 0px 4px 12px -2px"
                                : "rgba(0, 0, 0, 0.06) 0px 2px 8px -2px",
                              cursor: "pointer",
                              transition: "all 0.15s ease-in-out",
                              textAlign: "center",
                              lineHeight: "1.3",
                            }}
                            className="hover:scale-[1.02] active:scale-[0.98] select-none"
                          >
                            {t(sec.label)}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* SECTION 1: POINTAGE */}
                  {activeSettingsSection === "pointage" && (
                    <div className="space-y-4 animate-fadeIn" id="settings-section-pointage">
                      <div
                        className="bg-white border px-4 py-[25px]"
                        style={{
                          borderColor: "rgb(201, 190, 205)",
                          borderRadius: "14px",
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[18px] font-bold text-black font-sans select-none">
                            {t("Masquer le pointage.")}
                          </span>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                const newVal = !hidePointage;
                                setHidePointage(newVal);
                                try {
                                  const envId = localStorage.getItem("defib_tenant_id") || "demo";
                                  localStorage.setItem("defib_hide_pointage", newVal ? "true" : "false");
                                  localStorage.setItem(`defib_${envId}_tech_hide_pointage`, newVal ? "true" : "false");
                                  if (authenticatedUser?.name) {
                                    localStorage.setItem(`defib_${envId}_tech_hide_pointage_${authenticatedUser.name}`, newVal ? "true" : "false");
                                  }
                                } catch (e) {}
                              }}
                              className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden"
                              style={{
                                backgroundColor: hidePointage
                                  ? "#fe4eba"
                                  : "#cbd5e1",
                              }}
                            >
                              <span
                                className="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out"
                                style={{
                                  transform: hidePointage
                                    ? "translateX(20px)"
                                    : "translateX(0px)",
                                }}
                              />
                            </button>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          try {
                            const envId = localStorage.getItem("defib_tenant_id") || "demo";
                            localStorage.setItem("defib_hide_pointage", hidePointage ? "true" : "false");
                            localStorage.setItem(`defib_${envId}_tech_hide_pointage`, hidePointage ? "true" : "false");
                            if (authenticatedUser?.name) {
                              localStorage.setItem(`defib_${envId}_tech_hide_pointage_${authenticatedUser.name}`, hidePointage ? "true" : "false");
                            }
                          } catch (e) {}
                          setActiveSettingsSection(null);
                        }}
                        style={{
                          backgroundColor: "rgb(53, 86, 236)",
                          color: "#fff",
                          fontSize: "18px",
                          fontWeight: "bold",
                          borderRadius: "12px",
                          padding: "14px 20px",
                          border: "none",
                          boxShadow:
                            "rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset",
                          cursor: "pointer",
                          width: "100%",
                        }}
                        className="hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center gap-1.5"
                      >
                        <span>Enregistrer</span>
                      </button>
                    </div>
                  )}

                  {/* SECTION 2: LOCALISATION */}
                  {activeSettingsSection === "localisation" && (
                    <div className="space-y-4 animate-fadeIn" id="settings-section-localisation">
                      <div className="space-y-1.5">
                        <div
                          className="bg-white border px-4 py-[25px]"
                          style={{
                            borderColor: "rgb(201, 190, 205)",
                            borderRadius: "14px",
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[18px] font-bold text-black font-sans select-none">
                              Activer la localisation.
                            </span>
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => {
                                  const newVal = gpsSharingLink === "Partagé" ? "Non partagé" : "Partagé";
                                  setGpsSharingLink(newVal);
                                }}
                                className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden"
                                style={{
                                  backgroundColor: gpsSharingLink === "Partagé"
                                    ? "rgb(254, 78, 187)"
                                    : "#cbd5e1",
                                }}
                              >
                                <span
                                  className="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out"
                                  style={{
                                    transform: gpsSharingLink === "Partagé"
                                      ? "translateX(20px)"
                                      : "translateX(0px)",
                                  }}
                                />
                              </button>
                            </div>
                          </div>
                        </div>
                        <div style={{ marginTop: "12px" }}>
                          <a
                            href="https://defibeo.com/school/"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontSize: "18px",
                              color: "#3556ec",
                              textDecoration: "underline",
                              fontWeight: "bold",
                            }}
                            className="font-sans block hover:opacity-85 text-blue-600 cursor-pointer"
                          >
                            Vous devez partager avec {companyInfo?.gmailPartageLocalisation || "(Manquant)"}, consultez l’aide.
                          </a>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          try {
                            localStorage.setItem("defib_tech_gps_sharing", gpsSharingLink);
                            if (authenticatedUser?.name) {
                              const envId = localStorage.getItem("defib_tenant_id") || "demo";
                              localStorage.setItem(`defib_${envId}_gps_${authenticatedUser.name}`, gpsSharingLink);
                            }
                          } catch (e) {}
                          setActiveSettingsSection(null);
                        }}
                        style={{
                          backgroundColor: "rgb(53, 86, 236)",
                          color: "#fff",
                          fontSize: "18px",
                          fontWeight: "bold",
                          borderRadius: "12px",
                          padding: "14px 20px",
                          border: "none",
                          boxShadow:
                            "rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset",
                          cursor: "pointer",
                          width: "100%",
                        }}
                        className="hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center gap-1.5"
                      >
                        <span>Enregistrer</span>
                      </button>
                    </div>
                  )}

                  {/* SECTION 3: ADRESSE */}
                  {activeSettingsSection === "adresse" && (
                    <form
                      onSubmit={handleSaveLocalisation}
                      className="space-y-4 animate-fadeIn"
                      id="settings-form-adresse"
                    >
                      <div className="space-y-4">
                        {/* Numéro et voie */}
                        <div className="space-y-1">
                          <label style={{ fontSize: "18px", color: "#000000" }} className="block font-bold">Numéro et voie.</label>
                          <input
                            type="text"
                            required
                            value={techStartStreet}
                            onChange={(e) => setTechStartStreet(e.target.value)}
                            placeholder="Ex: 15 Rue de la Paix"
                            style={{
                              fontSize: "18px",
                              padding: "14px",
                              borderRadius: "13px",
                              border: "1px solid rgb(201, 191, 205)",
                              outline: "none",
                              color: "rgb(0, 0, 0)",
                            }}
                            className="w-full bg-white focus:border-indigo-500 font-sans"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {/* Ville */}
                          <div className="space-y-1">
                            <label style={{ fontSize: "18px", color: "#000000" }} className="block font-bold">Ville.</label>
                            <input
                              type="text"
                              required
                              value={techStartCity}
                              onChange={(e) => setTechStartCity(e.target.value)}
                              placeholder="Ex: Paris"
                              style={{
                                fontSize: "18px",
                                padding: "14px",
                                borderRadius: "13px",
                                border: "1px solid rgb(201, 191, 205)",
                                outline: "none",
                                color: "rgb(0, 0, 0)",
                              }}
                              className="w-full bg-white focus:border-indigo-500 font-sans"
                            />
                          </div>

                          {/* Code postal */}
                          <div className="space-y-1">
                            <label style={{ fontSize: "18px", color: "#000000" }} className="block font-bold">Code postal.</label>
                            <input
                              type="text"
                              required
                              value={techStartZip}
                              onChange={(e) => setTechStartZip(e.target.value)}
                              placeholder="Ex: 75002"
                              style={{
                                fontSize: "18px",
                                padding: "14px",
                                borderRadius: "13px",
                                border: "1px solid rgb(201, 191, 205)",
                                outline: "none",
                                color: "rgb(0, 0, 0)",
                              }}
                              className="w-full bg-white focus:border-indigo-500 font-sans"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {/* Région */}
                          <div className="space-y-1">
                            <label style={{ fontSize: "18px", color: "#000000" }} className="block font-bold">Région.</label>
                            <select
                              required
                              value={techStartRegion}
                              onChange={(e) => setTechStartRegion(e.target.value)}
                              style={{
                                fontSize: "18px",
                                padding: "14px",
                                borderRadius: "13px",
                                border: "1px solid rgb(201, 191, 205)",
                                outline: "none",
                                color: "rgb(0, 0, 0)",
                                appearance: "none",
                                WebkitAppearance: "none",
                                MozAppearance: "none",
                              }}
                              className="w-full bg-white focus:border-indigo-500 appearance-none"
                            >
                              <option value="">Choisir une région</option>
                              {getRegionsForCountry(techStartCountry || 'France').map((r) => (
                                <option key={r} value={r}>{r}</option>
                              ))}
                            </select>
                          </div>

                          {/* Pays */}
                          <div className="space-y-1">
                            <label style={{ fontSize: "18px", color: "#000000" }} className="block font-bold">Pays.</label>
                            <select
                              required
                              value={techStartCountry}
                              onChange={(e) => setTechStartCountry(e.target.value)}
                              style={{
                                fontSize: "18px",
                                padding: "14px",
                                borderRadius: "13px",
                                border: "1px solid rgb(201, 191, 205)",
                                outline: "none",
                                color: "rgb(0, 0, 0)",
                                appearance: "none",
                                WebkitAppearance: "none",
                                MozAppearance: "none",
                              }}
                              className="w-full bg-white focus:border-indigo-500 appearance-none"
                            >
                              {["France", "Espagne", "Portugal", "Suisse", "Luxembourg", "Belgique", "Allemagne", "Pays-Bas", "Royaume-Uni", "Irlande", "Suède", "Pologne", "Tchéquie", "Autriche"].map((c) => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {/* Latitude */}
                          <div className="space-y-1">
                            <label style={{ fontSize: "18px", color: "#000000" }} className="block font-bold">Latitude.</label>
                            <input
                              type="text"
                              readOnly
                              required
                              value={(techStartLat && techStartLat.toLowerCase() !== 'null' && techStartLat.toLowerCase() !== 'undefined' && techStartLat.toLowerCase() !== 'nan') ? techStartLat : ''}
                              placeholder="Rempli automatiquement"
                              style={{
                                fontSize: "18px",
                                padding: "14px",
                                borderRadius: "13px",
                                border: "1px solid rgb(201, 191, 205)",
                                outline: "none",
                                color: "rgb(0, 0, 0)",
                                backgroundColor: "#f3f4f6",
                                cursor: "not-allowed",
                              }}
                              className="w-full"
                            />
                          </div>

                          {/* Longitude */}
                          <div className="space-y-1">
                            <label style={{ fontSize: "18px", color: "#000000" }} className="block font-bold">Longitude.</label>
                            <input
                              type="text"
                              readOnly
                              required
                              value={(techStartLng && techStartLng.toLowerCase() !== 'null' && techStartLng.toLowerCase() !== 'undefined' && techStartLng.toLowerCase() !== 'nan') ? techStartLng : ''}
                              placeholder="Rempli automatiquement"
                              style={{
                                fontSize: "18px",
                                padding: "14px",
                                borderRadius: "13px",
                                border: "1px solid rgb(201, 191, 205)",
                                outline: "none",
                                color: "rgb(0, 0, 0)",
                                backgroundColor: "#f3f4f6",
                                cursor: "not-allowed",
                              }}
                              className="w-full"
                            />
                          </div>
                        </div>

                        {/* Route Optimization selector */}
                        <div className="space-y-1.5">
                          <label
                            style={{ fontSize: "18px", color: "#000000" }}
                            className="block font-bold text-black select-none"
                          >
                            Stratégie des déplacements. *
                          </label>
                          <select
                            value={routeOptimization}
                            onChange={(e) => setRouteOptimization(e.target.value)}
                            style={{
                              fontSize: "18px",
                              padding: "14px",
                              borderRadius: "13px",
                              border: "1px solid rgb(201, 191, 205)",
                              outline: "none",
                              color: "rgb(0, 0, 0)",
                              appearance: "none",
                              WebkitAppearance: "none",
                              MozAppearance: "none",
                            }}
                            className="w-full bg-white font-semibold cursor-pointer focus:border-indigo-500"
                          >
                            <option value="Aller au plus proche d'abord">
                              Se rendre d'abord au plus proche.
                            </option>
                            <option value="Aller au plus loin d'abord">
                              Se rendre d'abord au plus éloigné.
                            </option>
                          </select>
                        </div>

                        {/* Navigation App selector */}
                        <div className="space-y-1.5">
                          <label
                            style={{ fontSize: "18px", color: "#000000" }}
                            className="block font-bold text-black select-none"
                          >
                            Application de navigation par défaut. *
                          </label>
                          <select
                            value={defaultNavApp}
                            onChange={(e) => setDefaultNavApp(e.target.value)}
                            style={{
                              fontSize: "18px",
                              padding: "14px",
                              borderRadius: "13px",
                              border: "1px solid rgb(201, 191, 205)",
                              outline: "none",
                              color: "rgb(0, 0, 0)",
                              appearance: "none",
                              WebkitAppearance: "none",
                              MozAppearance: "none",
                            }}
                            className="w-full bg-white font-semibold cursor-pointer focus:border-indigo-500"
                          >
                            <option value="apple-maps">Apple Maps</option>
                            <option value="google-maps">Google Maps</option>
                            <option value="waze">Waze</option>
                          </select>
                        </div>
                      </div>

                      <button
                        type="submit"
                        style={{
                          backgroundColor: "rgb(53, 86, 236)",
                          color: "#fff",
                          fontSize: "18px",
                          fontWeight: "bold",
                          borderRadius: "12px",
                          padding: "14px 20px",
                          border: "none",
                          boxShadow:
                            "rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset",
                          cursor: "pointer",
                          width: "100%",
                        }}
                        className="hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center gap-1.5 mt-2"
                      >
                        <span>Enregistrer</span>
                      </button>
                    </form>
                  )}

                  {/* SECTION 4: SIGNATURE */}
                  {activeSettingsSection === "signature" && (
                    <div className="space-y-4 animate-fadeIn" id="settings-section-signature">
                      <div className="space-y-3 text-left">
                        <label
                          style={{ fontSize: "18px", color: "#000000" }}
                          className="block font-bold text-black select-none"
                        >
                          Signature.
                        </label>
                        <p style={{ fontSize: "16px", color: "#000000", lineHeight: "1.5" }} className="font-sans font-normal">
                          Dessinez votre signature ci-dessous. Elle sera automatiquement apposée sur tous vos rapports de maintenance validés.
                        </p>

                        <div 
                          className="p-3 bg-white relative" 
                          style={{ 
                            border: "1px solid #c9bfcd", 
                            borderRadius: "13px", 
                            maxWidth: "400px" 
                          }}
                        >
                          <canvas
                            ref={sigCanvasRef}
                            width={380}
                            height={150}
                            className="w-full h-[150px] bg-white cursor-crosshair touch-none"
                            onMouseDown={startSigDrawing}
                            onMouseMove={drawSig}
                            onMouseUp={stopSigDrawing}
                            onMouseLeave={stopSigDrawing}
                            onTouchStart={startSigDrawing}
                            onTouchMove={drawSig}
                            onTouchEnd={stopSigDrawing}
                            style={{ borderRadius: "6px" }}
                          />
                          <div className="flex justify-between items-center mt-2">
                            <button
                              type="button"
                              onClick={clearSig}
                              className="text-[16px] text-red-500 font-bold hover:underline cursor-pointer font-sans bg-transparent border-none"
                            >
                              Effacer
                            </button>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleSaveSignature}
                        style={{
                          backgroundColor: "rgb(53, 86, 236)",
                          color: "#fff",
                          fontSize: "18px",
                          fontWeight: "bold",
                          borderRadius: "12px",
                          padding: "14px 20px",
                          border: "none",
                          boxShadow:
                            "rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset",
                          cursor: "pointer",
                          width: "100%",
                        }}
                        className="hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center gap-1.5"
                      >
                        <span>Enregistrer</span>
                      </button>
                    </div>
                  )}

                  {/* SECTION 5: APPARENCE */}
                  {activeSettingsSection === "apparence" && (
                    <div className="space-y-6 animate-fadeIn" id="settings-section-apparence">
                      {/* Choix du thème pour la session technicien */}
                      <div className="space-y-3 text-left" id="webapp-section-software-theme">
                        <h3 className="font-bold font-sans" style={{ fontSize: "18px", color: "#000000" }}>
                          {t("Apparence du logiciel pour votre session.")}
                        </h3>
                        <p style={{ fontSize: "16px", color: "#000000", lineHeight: "1.5" }} className="font-sans font-normal">
                          {t("Thème du logiciel (conforme accessibilité ISO/IEC 40500).")}
                        </p>

                        <div className="flex flex-col gap-2.5 pt-1">
                          {APP_THEMES.map((theme) => {
                            const isSelected = currentTechTheme.id === theme.id;
                            return (
                              <div
                                key={theme.id}
                                onClick={() => handleThemeSelect(theme.id)}
                                style={{
                                  border: "1px solid #c9bfcd",
                                  borderRadius: "13px",
                                }}
                                className="flex items-center gap-3 p-3.5 cursor-pointer select-none bg-white"
                                id={`webapp-theme-card-${theme.id}`}
                              >
                                <span 
                                  className="rounded-full flex items-center justify-center transition-all bg-white shrink-0"
                                  style={{
                                    border: isSelected ? '2.5px solid #fe4eba' : '2.5px solid #cbd5e1',
                                    width: '20px',
                                    height: '20px',
                                    minWidth: '20px',
                                    minHeight: '20px',
                                    backgroundColor: '#ffffff'
                                  }}
                                >
                                  {isSelected && (
                                    <span className="rounded-full bg-[#fe4eba]" style={{ width: '9px', height: '9px' }} />
                                  )}
                                </span>
                                <span
                                  className="font-medium text-black cursor-pointer select-none font-sans"
                                  style={{ fontSize: "18px", color: "#000000" }}
                                >
                                  {t(theme.name)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Choix du favicon pour la session technicien */}
                      <div className="space-y-3 text-left" id="webapp-section-software-favicon">
                        <h3 className="font-bold font-sans" style={{ fontSize: "18px", color: "#000000" }}>
                          {t("Choix du favicon du logiciel.")}
                        </h3>
                        <p style={{ fontSize: "16px", color: "#000000", lineHeight: "1.5" }} className="font-sans font-normal">
                          {t("Il s’agit de l’icône montré dans l’onglet de votre navigateur.")}
                        </p>

                        <div className="flex flex-col gap-2.5 pt-1">
                          {APP_FAVICONS.map((fav) => {
                            const isSelected = currentTechFavicon.id === fav.id;
                            return (
                              <div
                                key={fav.id}
                                onClick={() => handleFaviconSelect(fav.id)}
                                style={{
                                  border: "1px solid #c9bfcd",
                                  borderRadius: "13px",
                                }}
                                className="flex items-center gap-3 p-3.5 cursor-pointer select-none bg-white"
                                id={`webapp-favicon-card-${fav.id}`}
                              >
                                <span 
                                  className="rounded-full flex items-center justify-center transition-all bg-white shrink-0"
                                  style={{
                                    border: isSelected ? '2.5px solid #fe4eba' : '2.5px solid #cbd5e1',
                                    width: '20px',
                                    height: '20px',
                                    minWidth: '20px',
                                    minHeight: '20px',
                                    backgroundColor: '#ffffff'
                                  }}
                                >
                                  {isSelected && (
                                    <span className="rounded-full bg-[#fe4eba]" style={{ width: '9px', height: '9px' }} />
                                  )}
                                </span>
                                <img
                                  src={fav.url}
                                  alt={fav.name}
                                  className="w-5 h-5 object-contain shrink-0"
                                  referrerPolicy="no-referrer"
                                />
                                <span
                                  className="font-medium text-black cursor-pointer select-none font-sans"
                                  style={{ fontSize: "18px", color: "#000000" }}
                                >
                                  {t(fav.name)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setActiveSettingsSection(null)}
                        style={{
                          backgroundColor: "rgb(53, 86, 236)",
                          color: "#fff",
                          fontSize: "18px",
                          fontWeight: "bold",
                          borderRadius: "12px",
                          padding: "14px 20px",
                          border: "none",
                          boxShadow:
                            "rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset",
                          cursor: "pointer",
                          width: "100%",
                        }}
                        className="hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center gap-1.5"
                      >
                        <span>Appliquer</span>
                      </button>
                    </div>
                  )}

                  {/* SECTION 6: INSTALLER L'APP */}
                  {activeSettingsSection === "installer" && (
                    <div className="space-y-4 animate-fadeIn" id="settings-section-installer">
                      <div 
                        className="bg-white overflow-hidden text-left flex flex-col justify-between"
                        style={{
                          border: "1px solid #c9bfcd",
                          borderRadius: "13px",
                        }}
                        id="webapp-add-to-home-screen-card"
                      >
                        <div className="p-5 pb-2 space-y-1">
                          <h4 className="font-bold font-sans" style={{ fontSize: "18px", color: "#000000" }}>
                            {t("Ajouter à l'écran d'accueil.")}
                          </h4>
                          <p className="font-sans leading-relaxed" style={{ fontSize: "16px", color: "#000000" }}>
                            {t("Sur iPhone ou iPad, depuis Safari (iOS 26), touchez l’icône Partager (le carré avec une flèche vers le haut), faites défiler le menu vers le bas puis sélectionnez Sur l’écran d’accueil (carré avec un « + »). Vérifiez ensuite que l’option Ouvrir en tant qu’app web est bien activée, puis appuyez sur Ajouter en haut à droite.")}
                          </p>
                        </div>
                        <div className="w-full flex justify-center items-end pt-2">
                          <img
                            src="https://civilprom.s3.eu-north-1.amazonaws.com/Illustration+Add+To+Home+Screen.svg"
                            alt="Illustration Add To Home Screen"
                            className="w-full h-auto block select-none pointer-events-none"
                            style={{ marginBottom: 0, display: "block" }}
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setActiveSettingsSection(null)}
                        style={{
                          backgroundColor: "rgb(53, 86, 236)",
                          color: "#fff",
                          fontSize: "18px",
                          fontWeight: "bold",
                          borderRadius: "12px",
                          padding: "14px 20px",
                          border: "none",
                          boxShadow:
                            "rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset",
                          cursor: "pointer",
                          width: "100%",
                        }}
                        className="hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center gap-1.5"
                      >
                        <span>Appliquer</span>
                      </button>
                    </div>
                  )}

                  {/* SECTION 7: GOOGLE CALENDAR */}
                  {activeSettingsSection === "calendar" && (
                    <div className="space-y-4 animate-fadeIn" id="settings-section-calendar">
                      <h3 className="text-lg font-bold text-slate-800">
                        Intégration Google Calendar
                      </h3>

                      {syncStatusMsg && (
                        <p
                          style={{
                            fontSize: "18px",
                            color: "rgb(254, 78, 187)",
                            textAlign: "center"
                          }}
                        >
                          {syncStatusMsg.text}
                        </p>
                      )}

                      {showDomainHelp && (
                        <div
                          className="p-4 bg-amber-50 text-amber-800 border border-amber-200 rounded-[12px] space-y-2"
                          id="domain-authorization-guide"
                        >
                          <p className="font-bold text-sm">
                            💡 Action requise sur votre projet Firebase :
                          </p>
                          <p className="text-xs leading-relaxed">
                            Pour des raisons de sécurité, Google demande à ce
                            que le nom de domaine de la webapp soit rajouté aux
                            domaines autorisés de votre projet Firebase.
                          </p>
                          <ol className="text-xs list-decimal pl-4 space-y-1.5 font-medium">
                            <li>
                              Ouvrez la console Firebase :{" "}
                              <a
                                href="https://console.firebase.google.com"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-indigo-600 underline font-semibold hover:text-indigo-800"
                              >
                                console.firebase.google.com
                              </a>
                            </li>
                            <li>
                              Allez dans <strong>Authentication</strong> &gt;
                              onglet <strong>Paramètres</strong> &gt; section{" "}
                              <strong>Domaines autorisés</strong>
                            </li>
                            <li>
                              Cliquez sur le bouton{" "}
                              <strong>Ajouter un domaine</strong>
                            </li>
                            <li>
                              Saisissez l'adresse suivante :{" "}
                              <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono text-amber-900 font-bold select-all">
                                {window.location.hostname}
                              </code>
                            </li>
                          </ol>
                          <p className="text-xs text-amber-700 pt-1 font-semibold">
                            Une fois l'adresse ajoutée, recliquez sur
                            "Synchroniser Google Calendar" !
                          </p>
                          <div className="mt-3 pt-2 border-t border-amber-200 flex flex-col gap-1.5" id="simulate-google-cal-sync-container-1">
                            <p className="text-[11px] text-amber-700 font-sans">
                              Pour vos tests en mode aperçu, vous pouvez également simuler la synchronisation immédiatement :
                            </p>
                            <button
                              type="button"
                              onClick={async () => {
                                const mockToken = "mock_token_" + Date.now();
                                const email = authenticatedUser?.email || "tech.demo@gmail.com";
                                setGoogleAccessToken(mockToken);
                                setSyncedGoogleEmail(email);
                                const techName = authenticatedUser?.name || "common";
                                localStorage.setItem(`defib_google_cal_email_${techName}`, email);
                                try {
                                  const syncResult = await performGoogleCalendarSync(mockToken);
                                  const calendarId = syncResult.calendarId || "mock_calendar_id";
                                  if (authenticatedUser) {
                                    const updatedMembers = members.map((m) => {
                                      if (m.name.trim().toLowerCase() === authenticatedUser.name.trim().toLowerCase()) {
                                        return {
                                          ...m,
                                          googleCalEmail: email,
                                          googleCalId: calendarId,
                                        };
                                      }
                                      return m;
                                    });
                                    onUpdateMembers(updatedMembers);
                                    const updatedUser = {
                                      ...authenticatedUser,
                                      googleCalEmail: email,
                                      googleCalId: calendarId,
                                    };
                                    setAuthenticatedUser(updatedUser);
                                    localStorage.setItem("defib_active_tech_session", JSON.stringify(updatedUser));
                                  }
                                  setSyncStatusMsg({
                                    type: "success",
                                    text: `Agenda Google synchronisé avec succès (Mode Simulation) ! ${syncResult.count} mission(s) synchronisée(s).`,
                                  });
                                  setShowDomainHelp(false);
                                  setShowOperationHelp(false);
                                } catch (err: any) {
                                  alert("Erreur lors de la simulation : " + err.message);
                                }
                              }}
                              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-[8px] font-sans text-xs font-bold transition-all w-fit shadow-sm cursor-pointer select-none"
                            >
                              🚀 Simuler la synchronisation Google Calendar
                            </button>
                          </div>
                        </div>
                      )}

                      {showOperationHelp && (
                        <div
                          className="p-4 bg-amber-50 text-amber-800 border border-amber-200 rounded-[12px] space-y-2"
                          id="sign-in-method-guide"
                        >
                          <p className="font-bold text-sm">
                            💡 Configuration requise pour la connexion Google :
                          </p>
                          <p className="text-xs leading-relaxed">
                            Le fournisseur de connexion Google doit être activé
                            sur votre projet Firebase.
                          </p>
                          <ol className="text-xs list-decimal pl-4 space-y-1.5 font-medium">
                            <li>
                              Allez sur{" "}
                              <a
                                href="https://console.firebase.google.com"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-indigo-600 underline font-semibold hover:text-indigo-800"
                              >
                                console.firebase.google.com
                              </a>
                            </li>
                            <li>
                              Allez dans <strong>Authentication</strong> &gt;
                              onglet <strong>Sign-in method</strong>
                            </li>
                            <li>
                              Dans la liste des fournisseurs, cliquez sur{" "}
                              <strong>Google</strong>
                            </li>
                            <li>
                              Cochez l'interrupteur <strong>Activer</strong>,
                              sélectionnez une adresse e-mail d'assistance, puis
                              cliquez sur <strong>Enregistrer</strong>
                            </li>
                          </ol>
                          <p className="text-xs text-amber-700 pt-1 font-semibold">
                            Une fois activé, réessayez la synchronisation !
                          </p>
                          <div className="mt-3 pt-2 border-t border-amber-200 flex flex-col gap-1.5" id="simulate-google-cal-sync-container-2">
                            <p className="text-[11px] text-amber-700 font-sans">
                              Pour vos tests en mode aperçu, vous pouvez également simuler la synchronisation immédiatement :
                            </p>
                            <button
                              type="button"
                              onClick={async () => {
                                const mockToken = "mock_token_" + Date.now();
                                const email = authenticatedUser?.email || "tech.demo@gmail.com";
                                setGoogleAccessToken(mockToken);
                                setSyncedGoogleEmail(email);
                                const techName = authenticatedUser?.name || "common";
                                localStorage.setItem(`defib_google_cal_email_${techName}`, email);
                                try {
                                  const syncResult = await performGoogleCalendarSync(mockToken);
                                  const calendarId = syncResult.calendarId || "mock_calendar_id";
                                  if (authenticatedUser) {
                                    const updatedMembers = members.map((m) => {
                                      if (m.name.trim().toLowerCase() === authenticatedUser.name.trim().toLowerCase()) {
                                        return {
                                          ...m,
                                          googleCalEmail: email,
                                          googleCalId: calendarId,
                                        };
                                      }
                                      return m;
                                    });
                                    onUpdateMembers(updatedMembers);
                                    const updatedUser = {
                                      ...authenticatedUser,
                                      googleCalEmail: email,
                                      googleCalId: calendarId,
                                    };
                                    setAuthenticatedUser(updatedUser);
                                    localStorage.setItem("defib_active_tech_session", JSON.stringify(updatedUser));
                                  }
                                  setSyncStatusMsg({
                                    type: "success",
                                    text: `Agenda Google synchronisé avec succès (Mode Simulation) ! ${syncResult.count} mission(s) synchronisée(s).`,
                                  });
                                  setShowDomainHelp(false);
                                  setShowOperationHelp(false);
                                } catch (err: any) {
                                  alert("Erreur lors de la simulation : " + err.message);
                                }
                              }}
                              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-[8px] font-sans text-xs font-bold transition-all w-fit shadow-sm cursor-pointer select-none"
                            >
                              🚀 Simuler la synchronisation Google Calendar
                            </button>
                          </div>
                        </div>
                      )}

                      {showCalendarApiHelp && (
                        <div
                          className="p-4 bg-amber-50 text-amber-800 border border-amber-200 rounded-[12px] space-y-3"
                          id="google-calendar-api-guide"
                        >
                          <p className="font-bold text-sm">
                            💡 Activer l'API Google Calendar sur votre projet :
                          </p>
                          <p className="text-xs leading-relaxed">
                            L'API Google Calendar n'est pas encore activée sur votre projet Google Cloud pour le projet numéro <strong>{disabledProjectNumber}</strong>.
                          </p>
                          <div className="pt-1">
                            <a
                              href={`https://console.developers.google.com/apis/api/calendar-json.googleapis.com/overview?project=${disabledProjectNumber}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-[8px] font-sans text-xs font-bold transition-all w-fit shadow-sm cursor-pointer select-none"
                            >
                              🔗 Activer l'API Google Calendar dans Google Cloud Console
                            </a>
                          </div>
                          <div className="pt-2 border-t border-amber-200 flex flex-col gap-1.5">
                            <p className="text-[11px] text-amber-700 font-sans">
                              Pour vos tests en mode aperçu sans modifier le Cloud Google, vous pouvez utiliser le mode simulation :
                            </p>
                            <button
                              type="button"
                              onClick={async () => {
                                const mockToken = "mock_token_" + Date.now();
                                const email = authenticatedUser?.email || "tech.demo@gmail.com";
                                setGoogleAccessToken(mockToken);
                                setSyncedGoogleEmail(email);
                                const techName = authenticatedUser?.name || "common";
                                localStorage.setItem(`defib_google_cal_email_${techName}`, email);
                                try {
                                  const syncResult = await performGoogleCalendarSync(mockToken);
                                  const calendarId = syncResult.calendarId || "mock_calendar_id";
                                  if (authenticatedUser) {
                                    const updatedMembers = members.map((m) => {
                                      if (m.name.trim().toLowerCase() === authenticatedUser.name.trim().toLowerCase()) {
                                        return {
                                          ...m,
                                          googleCalEmail: email,
                                          googleCalId: calendarId,
                                        };
                                      }
                                      return m;
                                    });
                                    onUpdateMembers(updatedMembers);
                                    const updatedUser = {
                                      ...authenticatedUser,
                                      googleCalEmail: email,
                                      googleCalId: calendarId,
                                    };
                                    setAuthenticatedUser(updatedUser);
                                    localStorage.setItem("defib_active_tech_session", JSON.stringify(updatedUser));
                                  }
                                  setSyncStatusMsg({
                                    type: "success",
                                    text: `Agenda Google synchronisé avec succès (Mode Simulation) ! ${syncResult.count} mission(s) synchronisée(s).`,
                                  });
                                  setShowCalendarApiHelp(false);
                                } catch (err: any) {
                                  alert("Erreur lors de la simulation : " + err.message);
                                }
                              }}
                              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-[8px] font-sans text-xs font-bold transition-all w-fit shadow-sm cursor-pointer select-none"
                            >
                              🚀 Simuler la synchronisation Google Calendar
                            </button>
                          </div>
                        </div>
                      )}

                      {!syncedGoogleEmail ? (
                        <button
                          type="button"
                          onClick={handleGoogleCalendarSync}
                          disabled={isSyncingGoogleCal}
                          style={{
                            backgroundColor: "rgb(53, 86, 236)",
                            color: "#ffffff",
                            fontSize: "18px",
                            fontWeight: "bold",
                            borderRadius: "12px",
                            padding: "14px 20px",
                            border: "none",
                            cursor: "pointer",
                            width: "100%",
                          }}
                          className="hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
                        >
                          {isSyncingGoogleCal ? (
                            <span>Connexion en cours...</span>
                          ) : (
                            <span>Synchroniser Google Calendar</span>
                          )}
                        </button>
                      ) : (
                        <div className="space-y-3">
                          <p
                            style={{
                              fontSize: "18px",
                              color: "#000000",
                              textAlign: "center"
                            }}
                          >
                            Compte synchronisé ({syncedGoogleEmail})
                          </p>

                          <button
                            type="button"
                            onClick={handleGoogleCalendarSync}
                            disabled={isSyncingGoogleCal}
                            style={{
                              backgroundColor: "#000000",
                              color: "#ffffff",
                              fontSize: "18px",
                              fontWeight: "bold",
                              borderRadius: "12px",
                              padding: "14px 20px",
                              border: "none",
                              cursor: "pointer",
                              width: "100%",
                            }}
                            className="hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
                          >
                            {isSyncingGoogleCal ? (
                              <span>Synchronisation en cours...</span>
                            ) : (
                              <span>Forcer la synchronisation</span>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={handleDeactivateGoogleCalendar}
                            style={{
                              backgroundColor: "#dc2626",
                              color: "#ffffff",
                              fontSize: "18px",
                              fontWeight: "bold",
                              borderRadius: "12px",
                              padding: "14px 20px",
                              border: "none",
                              cursor: "pointer",
                              width: "100%",
                            }}
                            className="hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
                          >
                            <span>Désactiver Google Calendar</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Quitter la session button */}
                  <button
                    type="button"
                    onClick={handleLogout}
                    style={{
                      backgroundColor: "#dc2626",
                      color: "#ffffff",
                      fontSize: "18px",
                      fontWeight: "bold",
                      borderRadius: "12px",
                      padding: "14px 20px",
                      border: "none",
                      cursor: "pointer",
                      width: "100%",
                    }}
                    className="hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center gap-2 mt-6"
                  >
                    <span>Quitter la session</span>
                  </button>
                </div>
              )}'''

# Now let's find the closing `)}` of `activeTab === "localisation"`
# Look for line `id="tab-localisation-screen"` and find the matching `</div>\n              )}`
tab_loc_idx = text.find('id="tab-localisation-screen"')
assert tab_loc_idx != -1

# Search forward for `              )}`
tab_close_tag = '\n              )}\n            </div>\n          </div>'
tab_close_idx = text.find(tab_close_tag, tab_loc_idx)
assert tab_close_idx != -1, 'tab_close_tag not found'

# Replace from start_idx to tab_close_idx
text = text[:start_idx] + new_block + text[tab_close_idx + len('\n              )}'):]

with open('src/components/PublicPortal.tsx', 'w') as f:
    f.write(text)

print('Réglages tab updated successfully!')
