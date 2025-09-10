export function validateFields(obj: any, required: string[]): string[] {
  return required.filter(field => !(field in obj) || obj[field] === undefined || obj[field] === null);
}
