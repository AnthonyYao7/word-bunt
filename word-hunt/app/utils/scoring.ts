export const wordScore = (len: number) => {
  if (len < 3) return 0;
  switch (len) {
    case 3:
      return 100;
    case 4:
      return 400;
    case 5:
      return 800;
    case 6:
      return 1400;
    case 7:
      return 1800;
    default:
      return 2200 + 400 * (len - 8);
  }
};

