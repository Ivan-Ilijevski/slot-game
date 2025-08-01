import random
import math
import time
from collections import defaultdict
import json

class SlotGameSimulator:
    def __init__(self, config):
        self.paytable = config["paytable"]
        self.virtual_reel_strips = config["virtual_reel_strips"]
        self.num_reels = len(self.virtual_reel_strips)
        self.num_rows = 3 # Fixed for a 5x3 game
        self.bet_per_line = config.get("bet_per_line", 1) # Default to 1 credit per line
        self.num_lines = config.get("num_lines", 10) # Default to 10 lines
        self.total_bet_per_spin = self.bet_per_line * self.num_lines

        self.base_bet_for_paytable_display = config.get("base_bet_for_paytable_display", 100)
        self.base_bet_per_line_display = self.base_bet_for_paytable_display / self.num_lines

        self.wild_symbol = config.get("wild_symbol", "Wild") 
        self.scatter_symbols = config.get("scatter_symbols", ["DollarScatter", "StarScatter"])
        self.wild_reels = [r - 1 for r in config.get("wild_reels", [2, 3, 4])] 
        self.star_scatter_reels = [r - 1 for r in config.get("star_scatter_reels", [1, 3, 5])] 

        self._parse_paytable()
        self.paylines = self._define_paylines() 

        self.total_payout = 0
        self.sum_of_squared_payouts = 0
        self.total_spins = 0
        self.total_winning_spins = 0
        self.max_win = 0
        self.payout_contributions = defaultdict(float) 

        self.config_name = config.get("config_name", "Unnamed Configuration")

    def _parse_paytable(self):
        self.line_pays = {}
        self.scatter_pays = {}
        self.regular_symbols = set() 

        for symbol, data in self.paytable.items():
            if symbol == self.wild_symbol:
                continue 
            if symbol in self.scatter_symbols:
                self.scatter_pays[symbol] = {int(k): v for k, v in data.items() if k.isdigit()}
            else:
                self.regular_symbols.add(symbol) 
                for count_str, payout in data.items():
                    if count_str.isdigit():
                        self.line_pays[(symbol, int(count_str))] = payout
        
        for sym_name in self.paytable:
            if sym_name not in self.scatter_symbols and sym_name != self.wild_symbol:
                self.regular_symbols.add(sym_name)

    def _define_paylines(self):
        return [
            [(0, 1), (1, 1), (2, 1), (3, 1), (4, 1)], # Payline 1
            [(0, 0), (1, 0), (2, 0), (3, 0), (4, 0)], # Payline 2
            [(0, 2), (1, 2), (2, 2), (3, 2), (4, 2)], # Payline 3
            [(0, 0), (1, 1), (2, 2), (3, 1), (4, 0)], # Payline 4
            [(0, 2), (1, 1), (2, 0), (3, 1), (4, 2)], # Payline 5
            [(0, 0), (1, 0), (2, 1), (3, 2), (4, 2)], # Payline 6
            [(0, 2), (1, 2), (2, 1), (3, 0), (4, 0)], # Payline 7
            [(0, 1), (1, 2), (2, 2), (3, 2), (4, 1)], # Payline 8
            [(0, 1), (1, 0), (2, 0), (3, 0), (4, 1)], # Payline 9
            [(0, 0), (1, 1), (2, 1), (3, 1), (4, 0)]  # Payline 10
        ]

    def _spin_reels(self):
        stop_positions = [random.randrange(len(strip)) for strip in self.virtual_reel_strips]
        visible = []
        for i in range(self.num_reels):
            reel_strip = self.virtual_reel_strips[i]
            start_index = stop_positions[i]
            reel_symbols_column = [
                reel_strip[(start_index + j) % len(reel_strip)]
                for j in range(self.num_rows)
            ]
            visible.append(reel_symbols_column)
        return visible

    def _apply_expanding_wilds(self, visible_symbols):
        current_visible_symbols = [col[:] for col in visible_symbols]
        for reel_idx in self.wild_reels:
            if any(sym == self.wild_symbol for sym in current_visible_symbols[reel_idx]):
                for row_idx in range(self.num_rows):
                    current_visible_symbols[reel_idx][row_idx] = self.wild_symbol
        return current_visible_symbols

    def _calculate_spin_payout(self, original_visible_symbols):
        current_spin_payout = 0
        is_winning_spin = False
        
        expanded_visible_symbols = self._apply_expanding_wilds(original_visible_symbols)

        dollar_scatter_count = sum(col.count("DollarScatter") for col in original_visible_symbols)
        if "DollarScatter" in self.scatter_pays and dollar_scatter_count in self.scatter_pays["DollarScatter"]:
            raw_payout = self.scatter_pays["DollarScatter"][dollar_scatter_count]
            scaled_payout = raw_payout / self.base_bet_for_paytable_display * self.total_bet_per_spin
            current_spin_payout += scaled_payout
            self.payout_contributions[f"DollarScatter x{dollar_scatter_count} (Scatter)"] += scaled_payout
            is_winning_spin = True

        star_scatter_count = 0
        for r_idx in self.star_scatter_reels:
            if any(sym == "StarScatter" for sym in original_visible_symbols[r_idx]):
                star_scatter_count += 1
        
        if "StarScatter" in self.scatter_pays and star_scatter_count in self.scatter_pays["StarScatter"]:
            raw_payout = self.scatter_pays["StarScatter"][star_scatter_count]
            scaled_payout = raw_payout / self.base_bet_for_paytable_display * self.total_bet_per_spin
            current_spin_payout += scaled_payout
            self.payout_contributions[f"StarScatter x{star_scatter_count} (Scatter)"] += scaled_payout
            is_winning_spin = True

        for payline in self.paylines:
            line_symbols_after_wild_expansion = [expanded_visible_symbols[reel_idx][row_idx] for reel_idx, row_idx in payline]
            raw_line_payout, winning_combo_key = self._check_line_win(line_symbols_after_wild_expansion)
            
            if raw_line_payout > 0:
                scaled_line_payout = raw_line_payout / self.base_bet_per_line_display * self.bet_per_line
                current_spin_payout += scaled_line_payout
                is_winning_spin = True
                self.payout_contributions[winning_combo_key] += scaled_line_payout

        return current_spin_payout, is_winning_spin

    def _check_line_win(self, line_symbols):
        best_raw_payout_on_line = 0 
        best_combo_key_on_line = None

        for target_symbol in self.regular_symbols:
            consecutive_count = 0
            for i in range(self.num_reels):
                symbol_on_line = line_symbols[i]
                if symbol_on_line == target_symbol or \
                   (symbol_on_line == self.wild_symbol and target_symbol not in self.scatter_symbols):
                    consecutive_count += 1
                else:
                    break 
            
            min_match = 2 if target_symbol == "Seven" else 3 
            for count_match in range(consecutive_count, min_match -1 , -1): 
                if (target_symbol, count_match) in self.line_pays:
                    raw_payout = self.line_pays[(target_symbol, count_match)]
                    if raw_payout > best_raw_payout_on_line: 
                        best_raw_payout_on_line = raw_payout
                        best_combo_key_on_line = f"{target_symbol} x{count_match}"
                    break 

        return best_raw_payout_on_line, best_combo_key_on_line 

    def run_simulation(self, num_spins):
        print(f"Starting Monte Carlo simulation for {num_spins:,} spins with reel configuration '{self.config_name}'...")
        print(f"Base Paytable Display Bet: {self.base_bet_for_paytable_display} credits")
        print(f"Simulation Bet per Line: {self.bet_per_line} credits")
        print(f"Simulation Total Bet per Spin: {self.total_bet_per_spin} credits")
        start_time = time.time()
        
        self.total_payout = 0
        self.sum_of_squared_payouts = 0
        self.total_spins = num_spins
        self.total_winning_spins = 0
        self.max_win = 0
        self.payout_contributions = defaultdict(float)
        
        # --- Progress Bar Variables ---
        progress_interval = max(1, num_spins // 100) # Update roughly 100 times, or every spin if less than 100
        last_progress_percent = -1
        # --- End Progress Bar Variables ---

        for i in range(num_spins): 
            original_visible_symbols = self._spin_reels()
            spin_payout, is_winning_spin = self._calculate_spin_payout(original_visible_symbols)

            self.total_payout += spin_payout
            self.sum_of_squared_payouts += (spin_payout ** 2)

            if is_winning_spin:
                self.total_winning_spins += 1
            if spin_payout > self.max_win:
                self.max_win = spin_payout

            # --- Progress Bar Update ---
            if (i + 1) % progress_interval == 0 or (i + 1) == num_spins:
                current_progress_percent = int(((i + 1) / num_spins) * 100)
                if current_progress_percent > last_progress_percent:
                    print(f"Progress: {current_progress_percent:3d}% complete...", end='\r')
                    last_progress_percent = current_progress_percent
            # --- End Progress Bar Update ---

        end_time = time.time()
        duration = end_time - start_time
        
        # Clear the progress line after completion
        print("                                                              \r", end='')

        # --- Calculate Results ---
        rtp = (self.total_payout / (self.total_spins * self.total_bet_per_spin)) * 100
        average_payout_per_spin = self.total_payout / self.total_spins
        average_squared_payout_per_spin = self.sum_of_squared_payouts / self.total_spins
        variance = average_squared_payout_per_spin - (average_payout_per_spin ** 2)
        std_dev = math.sqrt(variance) 
        hit_frequency = (self.total_winning_spins / self.total_spins) * 100
        average_win_amount = self.total_payout / self.total_winning_spins if self.total_winning_spins > 0 else 0

        print(f"\nSimulation complete in {duration:.2f} seconds.")
        print("\n--- Simulation Results ---")
        print(f"Config Name: {self.config_name}")
        print(f"Total Spins: {self.total_spins:,}")
        print(f"Total Bet: {self.total_spins * self.total_bet_per_spin:,} credits")
        print(f"Total Payout: {self.total_payout:,} credits")
        print(f"**Calculated RTP: {rtp:.4f}%**")
        print(f"Calculated Variance: {variance:.4f}")
        print(f"Calculated Standard Deviation (Volatility): {std_dev:.4f}")
        print(f"Hit Frequency: {hit_frequency:.4f}%")
        print(f"Average Win (per winning spin): {average_win_amount:.2f} credits")
        print(f"Maximum Win Observed: {self.max_win:,} credits")

        print("\n--- RTP Contribution Breakdown ---")
        sorted_contributions = sorted(self.payout_contributions.items(), key=lambda item: item[1], reverse=True)
        for combo, payout_sum in sorted_contributions:
            contribution_percent = (payout_sum / (self.total_spins * self.total_bet_per_spin)) * 100
            if contribution_percent > 0.0001: 
                print(f"- {combo:<30}: {payout_sum:10,.2f} credits ({contribution_percent:.4f}% RTP)")
        print("-" * 40)


# --- Define your base game configuration (excluding reels) ---
BASE_GAME_CONFIG = {
    "paytable": {
        "Seven": {"5": 50000, "4": 2500, "3": 500, "2": 100},
        "Watermelon": {"5": 7000, "4": 1200, "3": 400},
        "Grapes": {"5": 7000, "4": 1200, "3": 400},
        "Bell": {"5": 2000, "4": 400, "3": 200},
        "Plum": {"5": 1500, "4": 300, "3": 100},
        "Orange": {"5": 1500, "4": 300, "3": 100},
        "Cherry": {"5": 1500, "4": 300, "3": 100},
        "Lemon": {"5": 1500, "4": 300, "3": 100},
        "DollarScatter": {"5": 10000, "4": 2000, "3": 500},
        "StarScatter": {"3": 2000, "note": "Only appears on 1st, 3rd and 5th reels."}
    },
    "num_lines": 10,
    "bet_per_line": 1, 
    "base_bet_for_paytable_display": 100, 
    "wild_symbol": "Wild", 
    "scatter_symbols": ["DollarScatter", "StarScatter"],
    "wild_reels": [2, 3, 4], 
    "star_scatter_reels": [1, 3, 5] 
}

# --- Run the Simulations ---
if __name__ == "__main__":
    
    # Changed from 100_000_000 to 1_000_000
    NUM_SIMULATION_SPINS = 1_000_0000
    
    json_file_name = 'reels_rtp91_boosted.json' 
    try:
        with open(json_file_name, 'r') as f:
            reel_data_from_file = json.load(f)
    except FileNotFoundError:
        print(f"Error: '{json_file_name}' not found. Please ensure the file is in the same directory.")
        exit()
    except json.JSONDecodeError:
        print(f"Error: Could not decode '{json_file_name}'. Please check for JSON syntax errors.")
        exit()

    virtual_reel_strips = [
        reel_data_from_file.get("reel1", []),
        reel_data_from_file.get("reel2", []),
        reel_data_from_file.get("reel3", []),
        reel_data_from_file.get("reel4", []),
        reel_data_from_file.get("reel5", [])
    ]

    current_game_config = {**BASE_GAME_CONFIG, 
                           "virtual_reel_strips": virtual_reel_strips,
                           "config_name": f"Loaded Reels from {json_file_name}"}
    
    if any(not strip for strip in virtual_reel_strips):
        print(f"Warning: One or more reels (reel1-reel5) were not found or were empty in '{json_file_name}'. Please check the JSON file structure.")

    simulator = SlotGameSimulator(current_game_config)
    simulator.run_simulation(NUM_SIMULATION_SPINS)