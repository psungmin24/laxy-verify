// This build script intentionally fails
console.error("error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.");
console.error("src/index.ts(10,5): error TS2345: type mismatch");
process.exit(1);
