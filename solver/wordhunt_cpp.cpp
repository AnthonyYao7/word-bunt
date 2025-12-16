#include <pybind11/pybind11.h>
#include <pybind11/stl.h>

#include <algorithm>
#include <array>
#include <cctype>
#include <cstdint>
#include <fstream>
#include <random>
#include <stdexcept>
#include <string>
#include <unordered_set>
#include <vector>

namespace py = pybind11;
using std::array;
using std::string;
using std::vector;

static inline int word_score(int len) {
    if (len < 3) return 0;
    switch (len) {
        case 3: return 100;
        case 4: return 400;
        case 5: return 800;
        case 6: return 1400;
        case 7: return 1800;
        default: return 2200 + 400 * (len - 8);
    }
}

struct Trie {
    struct Node {
        int next[26];
        bool terminal = false;
        Node() { std::fill(std::begin(next), std::end(next), -1); }
    };
    vector<Node> t;
    Trie() { t.emplace_back(); }

    void insert(const std::string& w) {
        int v = 0;
        for (char c : w) {
            int k = c - 'a';
            if (t[v].next[k] == -1) {
                t[v].next[k] = (int)t.size();
                t.emplace_back();
            }
            v = t[v].next[k];
        }
        t[v].terminal = true;
    }
};

static vector<vector<int>> build_neighbors_4x4() {
    vector<vector<int>> nbr(16);
    auto idx = [](int r, int c) { return r * 4 + c; };
    for (int r = 0; r < 4; r++) for (int c = 0; c < 4; c++) {
        int v = idx(r, c);
        for (int dr = -1; dr <= 1; dr++) for (int dc = -1; dc <= 1; dc++) {
            if (dr == 0 && dc == 0) continue;
            int nr = r + dr, nc = c + dc;
            if (0 <= nr && nr < 4 && 0 <= nc && nc < 4)
                nbr[v].push_back(idx(nr, nc));
        }
    }
    return nbr;
}

static void dfs_all_words(
    int cell,
    uint16_t usedMask,
    int trieNode,
    const array<char, 16>& board,
    const vector<vector<int>>& nbr,
    const Trie& trie,
    std::string& cur,
    std::unordered_set<std::string>& outWords
) {
    char ch = board[cell];
    int k = ch - 'a';
    if (k < 0 || k >= 26) return;

    int nxt = trie.t[trieNode].next[k];
    if (nxt == -1) return;

    usedMask |= (uint16_t)(1u << cell);
    cur.push_back(ch);

    if (trie.t[nxt].terminal && cur.size() >= 3) outWords.insert(cur);

    for (int to : nbr[cell]) {
        if ((usedMask >> to) & 1u) continue;
        dfs_all_words(to, usedMask, nxt, board, nbr, trie, cur, outWords);
    }

    cur.pop_back();
}

static array<char, 16> parse_board_any(py::object board_obj) {
    // Accept:
    //  - 16-char string
    //  - list/tuple of 4 strings length 4
    //  - list of 16 single-character strings
    array<char, 16> b{};

    if (py::isinstance<py::str>(board_obj)) {
        std::string s = py::cast<std::string>(board_obj);
        std::string t;
        for (unsigned char c : s) {
            if (std::isalpha(c)) t.push_back((char)std::tolower(c));
        }
        if (t.size() != 16) throw std::runtime_error("board string must contain 16 letters");
        for (int i = 0; i < 16; i++) b[i] = t[i];
        return b;
    }

    if (py::isinstance<py::sequence>(board_obj)) {
        py::sequence seq = py::cast<py::sequence>(board_obj);
        if (seq.size() == 4 && py::isinstance<py::str>(seq[0])) {
            std::string t;
            for (int r = 0; r < 4; r++) {
                std::string row = py::cast<std::string>(seq[r]);
                for (unsigned char c : row) if (std::isalpha(c)) t.push_back((char)std::tolower(c));
            }
            if (t.size() != 16) throw std::runtime_error("4 rows must contain 16 letters total");
            for (int i = 0; i < 16; i++) b[i] = t[i];
            return b;
        }

        // 16 items
        if (seq.size() == 16) {
            for (int i = 0; i < 16; i++) {
                std::string cell = py::cast<std::string>(seq[i]);
                if (cell.size() != 1 || !std::isalpha((unsigned char)cell[0]))
                    throw std::runtime_error("board list must contain 16 single letters");
                b[i] = (char)std::tolower((unsigned char)cell[0]);
            }
            return b;
        }
    }

    throw std::runtime_error("board must be a 16-letter string, 4x4 list of strings, or list of 16 letters");
}

static char random_letter(std::mt19937& rng) {
    static const double freq[26] = {
        8.17, 1.49, 2.78, 4.25, 12.70, 2.23, 2.02, 6.09, 6.97, 0.15, 0.77, 4.03,
        2.41, 6.75, 7.51, 1.93, 0.10, 5.99, 6.33, 9.06, 2.76, 0.98, 2.36, 0.15,
        1.97, 0.07
    };
    // IMPORTANT: not const (operator() is non-const)
    static thread_local std::discrete_distribution<int> dist(std::begin(freq), std::end(freq));
    return (char)('a' + dist(rng));
}

static std::string generate_board_py(uint32_t seed) {
    std::mt19937 rng(seed);
    std::string out;
    out.reserve(16);
    for (int i = 0; i < 16; i++) out.push_back(random_letter(rng));
    return out;
}

struct Dictionary {
    Trie trie;
    vector<vector<int>> nbr;

    Dictionary(const std::string& dict_path) : nbr(build_neighbors_4x4()) {
        std::ifstream in(dict_path);
        if (!in) throw std::runtime_error("Failed to open dictionary file: " + dict_path);

        std::string w;
        while (in >> w) {
            std::string s;
            s.reserve(w.size());
            bool ok = true;
            for (unsigned char ch : w) {
                if (!std::isalpha(ch)) { ok = false; break; }
                s.push_back((char)std::tolower(ch));
            }
            if (ok && (int)s.size() >= 3) trie.insert(s);
        }
    }

    py::tuple solve(py::object board_obj) const {
        auto board = parse_board_any(board_obj);

        std::unordered_set<std::string> found;
        found.reserve(4096);
        std::string cur;
        cur.reserve(16);

        for (int i = 0; i < 16; i++) dfs_all_words(i, 0, 0, board, nbr, trie, cur, found);

        vector<string> words(found.begin(), found.end());
        std::sort(words.begin(), words.end(), [](const string& a, const string& b) {
            if (a.size() != b.size()) return a.size() > b.size();
            return a < b;
        });

        long long total = 0;
        for (auto& w : words) total += word_score((int)w.size());

        return py::make_tuple(words, total);
    }
};

PYBIND11_MODULE(wordhunt_cpp, m) {
    m.doc() = "Word Hunt / Boggle-style 4x4 solver";

    m.def("word_score", &word_score, "Score a word length");
    m.def("generate_board", &generate_board_py, py::arg("seed"),
          "Generate a random 16-letter board (string) given a seed");

    py::class_<Dictionary>(m, "Dictionary")
        .def(py::init<const std::string&>(), py::arg("dict_path"))
        .def("solve", &Dictionary::solve, py::arg("board"),
             "Solve board and return (words_sorted, total_score)");
}

