// Semester 1 starter pack: the subjects, units, topics and the CSA day-by-day schedule from the
// syllabus screenshots, so the app is useful before any scanning. Pure data; state.js saves it.
// `on` puts a topic on a date; `extra` are dated sessions that are not topics (revision, mocks, exams).

const t = (title, minutes = 30, notes = '', on = '') => ({ title, minutes, notes, on });
const rev = (date, title, minutes = 120, kind = 'revise') => ({ date, title, minutes, kind });
const exam = (date, title) => ({ date, title, minutes: 0, kind: 'manual' });

const CSA = {
  title: 'Computer System Architecture',
  examDate: '2026-12-11',
  units: [
    { title: 'Unit 1: Digital logic basics', chapters: [{ title: 'Ch 1', topics: [
      t('Ch 1 (1.1–1.4): Logic gates, Boolean algebra, 2/3/4-variable K-maps, don’t care', 120, '', '2026-11-17'),
      t('Ch 1 (1.5–1.7): Half/full adders, SR/D/JK/T flip-flops, characteristic & excitation tables', 120, '', '2026-11-18')] }] },
    { title: 'Unit 2: Combinational and sequential circuits', chapters: [
      { title: 'Ch 2', topics: [t('Ch 2 (2.1–2.7): ICs, 3×8 decoders, encoders, 4×1 MUX, registers, counters, RAM/ROM', 120, '', '2026-11-19')] },
      { title: 'Ch 4', topics: [t('Ch 4 (4.1–4.4): RTL notation, common bus system, 4-bit adder-subtractor, arithmetic circuit', 120, '', '2026-11-20')] }] },
    { title: 'Unit 3: Data representation', chapters: [{ title: 'Ch 3', topics: [
      t('Ch 3 (3.1–3.3, 3.5): Number systems, 1’s/2’s complements, overflow, floating point & IEEE 754', 120, '', '2026-11-21')] }] },
    { title: 'Unit 4: Basic computer and pipelining', chapters: [
      { title: 'Ch 5', topics: [
        t('Ch 5 (5.1–5.4): Instruction codes, registers (PC, AR, IR, DR, AC), common bus, timing & SC', 120, '', '2026-11-22'),
        t('Ch 5 (5.5–5.8): Instruction cycle flowchart, memory-reference RTL (AND, ADD, LDA, STA, BUN, BSA, ISZ), interrupts', 120, '', '2026-11-23')] },
      { title: 'Ch 6', topics: [t('Ch 6 (6.1–6.2): Machine vs assembly language, pseudo-instructions (ORG, END, DEC, HEX)', 120, '', '2026-11-24')] },
      { title: 'Ch 9', topics: [t('Ch 9 (9.1, 9.2, 9.4): Flynn’s classification, space-time speedup, 4-segment pipeline & hazards', 120, '', '2026-11-29')] }] },
    { title: 'Unit 5: CPU organisation', chapters: [{ title: 'Ch 8', topics: [
      t('Ch 8 (8.1–8.2): General register organisation, control word (SELA/SELB/SELD/OPR), stack & RPN', 120, '', '2026-11-30'),
      t('Ch 8 (8.3–8.5, 8.8): 3/2/1/0-address formats, addressing modes, RISC vs CISC, multicore & GPUs', 120, '', '2026-12-01')] }] },
    { title: 'Unit 6: I/O and memory', chapters: [
      { title: 'Ch 11', topics: [
        t('Ch 11 (11.1, 11.2, 11.4): I/O interface, isolated vs memory-mapped I/O, programmed & interrupt I/O', 120, '', '2026-12-02'),
        t('Ch 11 (11.6): Direct memory access (DMA), BR/BG signals, burst vs cycle stealing', 120, '', '2026-12-03')] },
      { title: 'Ch 12', topics: [
        t('Ch 12 (12.1–12.3): Memory hierarchy, RAM/ROM chip select logic, memory address map numericals', 120, '', '2026-12-04'),
        t('Ch 12 (12.4–12.5): Associative memory (CAM), cache mapping (direct, associative, set-associative)', 120, '', '2026-12-05')] }] },
    { title: 'Practical: CPU Simulator', chapters: [{ title: 'General', topics: [
      t('CPU Sim practical 1: Build the basic computer, registers, microinstructions & fetch routine', 120, '', '2026-11-25'),
      t('CPU Sim practical 2: Memory-ref and register-ref (CLA, CMA, CIR, SPA), direct/indirect programs', 120, '', '2026-11-26')] }] }
  ],
  extra: [
    rev('2026-11-27', 'Viva prep & revision: Units 1–4 diagrams, RTL micro-operations, flip-flop tables, CPU Sim viva'),
    exam('2026-11-28', 'EXAM DAY · DU Practical & Viva (CPU Sim 3.6.9)'),
    rev('2026-12-06', 'Revision Day 1 (Units 1 & 2): K-maps, flip-flops, decoders/MUX, common bus, arithmetic circuits'),
    rev('2026-12-07', 'Revision Day 2 (Units 3 & 4): complements, IEEE 754, instruction cycle, memory-ref RTL, pipelining'),
    rev('2026-12-08', 'Revision Day 3 (Units 5 & 6): addressing modes, stack RPN, DMA, memory address maps, cache mapping'),
    rev('2026-12-09', 'PYQ practice 1: DU Sem 1 past-year paper, timed 3-hour mock', 180, 'study'),
    rev('2026-12-10', 'PYQ practice 2: DU past paper 2 + quick formula & block-diagram recap', 150, 'study'),
    exam('2026-12-11', 'EXAM DAY · DU Sem 1 Theory Exam')
  ]
};

const MATHS = {
  title: 'Mathematics for Computing',
  examDate: '',
  units: [
    { title: 'Unit 1: Introduction to Matrix Algebra', chapters: [{ title: 'General', topics: [
      t('Echelon form of a matrix', 40, 'Reference: Ch 7, excluding Cramer’s rule and section 7.9.'),
      t('Rank of a matrix'), t('Determinant and inverse of a matrix', 45),
      t('Solution of homogeneous & non-homogeneous systems of equations', 45),
      t('Gauss elimination and Gauss–Jordan method', 45)] }] },
    { title: 'Unit 2: Vector Spaces', chapters: [{ title: 'General', topics: [
      t('Vector spaces and sub-spaces', 40, 'Reference: Ch 4 (4.1, 4.2, 4.3, 4.5, 4.6); Ch 6 (6.1, 6.2, 6.4, 6.7 up to Theorem 17); Ch 8 (8.3 up to Theorem 7).'),
      t('Linear combinations and linear span'), t('Linear independence / dependence'), t('Basis and dimension'),
      t('Linear transformation on finite-dimensional vector spaces', 45), t('Inner product space and Schwarz inequality'),
      t('Orthonormal basis'), t('Gram–Schmidt orthogonalization process', 45), t('Convex sets', 20)] }] },
    { title: 'Unit 3: Eigenvalues and Eigenvectors', chapters: [{ title: 'General', topics: [
      t('Characteristic polynomial', 30, 'Reference: Ch 5 (5.1–5.3); Ch 7 (7.2, pages 407–408); Ch 4 (4.9).'),
      t('Cayley–Hamilton theorem (numericals only)'), t('Eigenvalues and eigenvectors of a matrix', 40),
      t('Eigenspaces'), t('Diagonalization', 40), t('Positive definite matrices'), t('Applications to Markov matrices')] }] },
    { title: 'Unit 4: Vector Calculus', chapters: [{ title: 'General', topics: [
      t('Vector algebra and its laws', 30, 'Reference: Ch 9 (9.1–9.4, 9.7–9.9). Proofs of theorems are skipped; do the applications and problems.'),
      t('Dot product and cross product'), t('Vector and scalar fields'), t('Ordinary derivative of vectors and space curves'),
      t('Partial derivatives'), t('Del operator'), t('Gradient of a scalar field'), t('Directional derivative'),
      t('Gradient of matrices'), t('Divergence of a vector field'), t('Laplacian operator'), t('Curl of a vector field')] }] }
  ],
  extra: []
};

const POLCOMM = {
  title: 'Political Communication and Leadership',
  examDate: '',
  units: [
    { title: 'Unit I: Explaining Political Communication (3 weeks)', chapters: [{ title: 'General', topics: [t('Meaning, nature and scope'), t('Evolution and transformation')] }] },
    { title: 'Unit II: Exploring Leadership (3 weeks)', chapters: [{ title: 'General', topics: [t('Themes, theories and typologies'), t('Participation and performance')] }] },
    { title: 'Unit III: Expanding Political Communication and Leadership: Orientation and Action (3 weeks)', chapters: [{ title: 'General', topics: [
      t('Developing communication and leadership through research'), t('Strengthening techniques of communication and leadership')] }] },
    { title: 'Unit IV: Extending Political Communication and Leadership: Research Issues and Challenges (3 weeks)', chapters: [{ title: 'General', topics: [
      t('Researching communication and leadership through survey: opinion poll, exit poll'),
      t('Contemporary issues and challenges in communication and leadership')] }] },
    { title: 'Unit V: Executing Political Communication and Leadership: Empirical and Professional Implications (3 weeks)', chapters: [{ title: 'General', topics: [
      t('Psephology as an art and vocation'), t('Exploring career options', 20)] }] }
  ],
  extra: []
};

const CONSTITUTION = {
  title: 'Constitutional Values and Fundamental Duties',
  examDate: '',
  units: [
    { title: 'Unit I: The Constitution of India, an Introduction (5 weeks)', chapters: [{ title: 'General', topics: [
      t('Federal republic, rule of law, separation of powers'), t('Sovereignty, socialism, democracy'), t('Secularism and Sarva Dharma Sama Bhava')] }] },
    { title: 'Unit II: Constitutional Values (5 weeks)', chapters: [{ title: 'General', topics: [
      t('Justice: social, political, economic'), t('Liberty: thought, expression, belief, faith, worship'),
      t('Equality: equality before law and equal application of laws'), t('Fraternity: dignity, unity and integrity')] }] },
    { title: 'Unit III: Fundamental Duties (5 weeks)', chapters: [{ title: 'General', topics: [
      t('Ancient Indian notions of righteousness and duty consciousness'),
      t('Fundamental Duties: Article 51A (a)–(k)', 40),
      t('Legal status of Fundamental Duties: judicial approach')] }] }
  ],
  extra: []
};

export const STARTER = [CSA, MATHS, POLCOMM, CONSTITUTION];

// Plain outline objects (no ids yet) in the same order as the flattened topic list.
export function starterOutline(sub) {
  return sub.units.map(u => ({ title: u.title, chapters: u.chapters.map(c => ({ title: c.title, topics: c.topics.map(x => ({ title: x.title, minutes: x.minutes, notes: x.notes })) })) }));
}
export const starterTopics = sub => sub.units.flatMap(u => u.chapters.flatMap(c => c.topics));
