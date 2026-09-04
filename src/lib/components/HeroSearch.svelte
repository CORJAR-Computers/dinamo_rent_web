<script lang="ts">
  import { booking } from "$lib/stores/bookingStore.svelte";
  import { PICKUP_LOCATIONS } from "$lib/data/fleet";

  const TIME_OPTIONS = [
    "06:00",
    "07:00",
    "08:00",
    "09:00",
    "10:00",
    "11:00",
    "12:00",
    "13:00",
    "14:00",
    "15:00",
    "16:00",
    "17:00",
    "18:00",
    "19:00",
    "20:00",
    "21:00",
    "22:00",
    "23:00",
  ];

  function handleSearchClick(e: MouseEvent) {
    e.preventDefault();
    const fleetSection = document.getElementById("flota");
    if (fleetSection) {
      fleetSection.scrollIntoView({ behavior: "smooth" });
    }
  }
</script>

<section class="relative pt-8 pb-16 md:pt-16 md:pb-24 overflow-hidden">
  <!-- Subtle Background Gradients & Glow -->
  <div
    class="absolute inset-0 bg-radial-[at_top_center] from-blue-950/40 via-slate-950 to-slate-950 -z-10"
  ></div>
  <div
    class="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-cyan-600/10 blur-[130px] rounded-full pointer-events-none -z-10"
  ></div>
  <div
    class="absolute top-1/3 right-10 w-[400px] h-[300px] bg-orange-600/10 blur-[120px] rounded-full pointer-events-none -z-10"
  ></div>

  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <!-- Hero Header -->
    <div class="text-center max-w-3xl mx-auto space-y-4">
      <div
        class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-slate-700/60 shadow-inner"
      >
        <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
        <span class="text-xs font-semibold text-slate-300"
          >Flota 2024 - 2025 Disponible en Cartagena</span
        >
      </div>

      <h1
        class="font-heading font-black text-4xl sm:text-5xl lg:text-6xl text-white tracking-tight leading-[1.1]"
      >
        Explora Cartagena a tu Ritmo con <span
          class="bg-gradient-to-r from-orange-400 via-amber-300 to-orange-500 bg-clip-text text-transparent"
          >Dinamo Rent a Car</span
        >
      </h1>

      <p
        class="text-base sm:text-lg text-slate-300 max-w-2xl mx-auto font-normal leading-relaxed"
      >
        Renta tu auto en línea, recíbelo sin filas directamente en el <strong
          class="text-white font-semibold">Aeropuerto Rafael Núñez</strong
        > o en tu hotel. Tarifas transparentes, soporte 24/7 y kilometraje libre
        dentro de la costa.
      </p>
    </div>

    <!-- Search Form Card -->
    <div class="mt-10 max-w-5xl mx-auto">
      <div
        class="relative rounded-3xl bg-slate-900/90 border border-slate-700/80 p-5 sm:p-7 shadow-2xl backdrop-blur-xl shadow-cyan-950/20"
      >
        <form
          onsubmit={(e) => {
            e.preventDefault();
          }}
          class="space-y-5"
        >
          <!-- Locations Row -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Pickup Place -->
            <div class="space-y-1.5">
              <label
                for="pickup-loc"
                class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300"
              >
                <i class="fa-solid fa-location-dot text-orange-400"></i> Lugar de
                Entrega
              </label>
              <div class="relative">
                <select
                  id="pickup-loc"
                  bind:value={booking.pickupPlace}
                  class="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white font-medium focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition appearance-none cursor-pointer"
                >
                  {#each PICKUP_LOCATIONS as loc}
                    <option value={loc}>{loc}</option>
                  {/each}
                </select>
                <i
                  class="fa-solid fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none"
                ></i>
              </div>
            </div>

            <!-- Return Place -->
            <div class="space-y-1.5">
              <label
                for="return-loc"
                class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300"
              >
                <i class="fa-solid fa-flag-checkered text-cyan-400"></i> Lugar de
                Devolución
              </label>
              <div class="relative">
                <select
                  id="return-loc"
                  bind:value={booking.returnPlace}
                  class="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white font-medium focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none transition appearance-none cursor-pointer"
                >
                  {#each PICKUP_LOCATIONS as loc}
                    <option value={loc}>{loc}</option>
                  {/each}
                </select>
                <i
                  class="fa-solid fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none"
                ></i>
              </div>
            </div>
          </div>

          <!-- Dates & Times Row -->
          <div
            class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1"
          >
            <!-- Pickup Date -->
            <div class="space-y-1.5">
              <label
                for="p-date"
                class="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-300"
              >
                <i class="fa-regular fa-calendar-check text-orange-400"></i> Fecha
                Entrega
              </label>
              <input
                id="p-date"
                type="date"
                bind:value={booking.pickupDate}
                class="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white font-medium focus:ring-2 focus:ring-orange-500 outline-none transition cursor-pointer [color-scheme:dark]"
              />
            </div>

            <!-- Pickup Time -->
            <div class="space-y-1.5">
              <label
                for="p-time"
                class="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-300"
              >
                <i class="fa-regular fa-clock text-orange-400"></i> Hora Entrega
              </label>
              <div class="relative">
                <select
                  id="p-time"
                  bind:value={booking.pickupTime}
                  class="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white font-medium focus:ring-2 focus:ring-orange-500 outline-none transition appearance-none cursor-pointer"
                >
                  {#each TIME_OPTIONS as time}
                    <option value={time}>{time}</option>
                  {/each}
                </select>
                <i
                  class="fa-solid fa-chevron-down absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none"
                ></i>
              </div>
            </div>

            <!-- Return Date -->
            <div class="space-y-1.5">
              <label
                for="r-date"
                class="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-300"
              >
                <i class="fa-regular fa-calendar-xmark text-cyan-400"></i> Fecha
                Devolución
              </label>
              <input
                id="r-date"
                type="date"
                bind:value={booking.returnDate}
                min={booking.pickupDate}
                class="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white font-medium focus:ring-2 focus:ring-cyan-500 outline-none transition cursor-pointer [color-scheme:dark]"
              />
            </div>

            <!-- Return Time -->
            <div class="space-y-1.5">
              <label
                for="r-time"
                class="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-300"
              >
                <i class="fa-regular fa-clock text-cyan-400"></i> Hora Devolución
              </label>
              <div class="relative">
                <select
                  id="r-time"
                  bind:value={booking.returnTime}
                  class="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white font-medium focus:ring-2 focus:ring-cyan-500 outline-none transition appearance-none cursor-pointer"
                >
                  {#each TIME_OPTIONS as time}
                    <option value={time}>{time}</option>
                  {/each}
                </select>
                <i
                  class="fa-solid fa-chevron-down absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none"
                ></i>
              </div>
            </div>
          </div>

          <!-- Bottom Action Bar -->
          <div
            class="pt-3 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4"
          >
            <!-- Days badge -->
            <div class="flex items-center gap-3">
              <div
                class="px-4 py-2 rounded-xl bg-orange-500/10 border border-orange-500/30 flex items-center gap-2 text-orange-300 font-bold text-sm"
              >
                <i class="fa-solid fa-stopwatch text-orange-400"></i>
                <span
                  >Duración: {booking.rentalDays} día{booking.rentalDays > 1
                    ? "s"
                    : ""}</span
                >
              </div>
              <span class="text-xs text-slate-400 hidden lg:inline">
                Tarifa calculada por periodos de 24 horas
              </span>
            </div>

            <!-- Search Button -->
            <button
              type="button"
              onclick={handleSearchClick}
              class="w-full sm:w-auto px-8 py-3.5 rounded-xl font-heading font-black text-base text-white bg-gradient-to-r from-orange-500 via-orange-600 to-amber-500 hover:from-orange-600 hover:to-amber-600 transition shadow-xl shadow-orange-500/25 flex items-center justify-center gap-2 active:scale-98"
            >
              <i class="fa-solid fa-magnifying-glass"></i>
              <span>Ver Autos Disponibles</span>
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Features Bar -->
    <div class="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-5xl mx-auto">
      <div
        class="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-900/50 border border-slate-800/60"
      >
        <div
          class="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400 text-lg"
        >
          <i class="fa-solid fa-plane-arrival"></i>
        </div>
        <div>
          <h4 class="text-xs font-bold text-white uppercase tracking-wider">
            Aeropuerto CTG
          </h4>
          <p class="text-[11px] text-slate-400">Entrega en sala de llegadas</p>
        </div>
      </div>

      <div
        class="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-900/50 border border-slate-800/60"
      >
        <div
          class="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 text-lg"
        >
          <i class="fa-solid fa-road"></i>
        </div>
        <div>
          <h4 class="text-xs font-bold text-white uppercase tracking-wider">
            Km Ilimitado por la Costa
          </h4>
          <p class="text-[11px] text-slate-400">
            Viaja sin límites por la costa
          </p>
        </div>
      </div>

      <div
        class="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-900/50 border border-slate-800/60"
      >
        <div
          class="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-lg"
        >
          <i class="fa-solid fa-shield-halved"></i>
        </div>
        <div>
          <h4 class="text-xs font-bold text-white uppercase tracking-wider">
            Garantía Protegida
          </h4>
          <p class="text-[11px] text-slate-400">
            Bloqueo bancario transparente
          </p>
        </div>
      </div>

      <div
        class="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-900/50 border border-slate-800/60"
      >
        <div
          class="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 text-lg"
        >
          <i class="fa-solid fa-headset"></i>
        </div>
        <div>
          <h4 class="text-xs font-bold text-white uppercase tracking-wider">
            Soporte 24 Horas
          </h4>
          <p class="text-[11px] text-slate-400">
            Asistencia vial en todo momento
          </p>
        </div>
      </div>
    </div>
  </div>
</section>
