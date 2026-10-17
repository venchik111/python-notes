export function normalize(value) {
  return String(value ?? '').toLocaleLowerCase('ru').replaceAll('ё', 'е');
}
export function tokens(query) {
  return [...new Set(normalize(query).trim().split(/\s+/).filter(Boolean))];
}
export function blockText(block) {
  return [block.title, block.text, block.code, block.output,
    ...(block.items || []), ...(block.headers || []), ...(block.rows || []).flat()].filter(v=>v!==undefined).join('\n');
}
export function createIndex(data) {
  return data.lessons.flatMap(lesson => lesson.topics.map(topic => {
    const text = [topic.when, topic.rule, topic.code, topic.error, ...topic.details,
      ...(topic.blocks || []).map(blockText), topic.demo?.title, topic.demo?.intro, topic.demo?.searchText,
      ...(topic.demo?.labels || []), topic.demo?.code, topic.demo?.output].filter(Boolean).join('\n');
    return {lesson, topic, text, title: normalize(topic.title),
      aliases: normalize(topic.terms.join(' ')),
      haystack: normalize([lesson.number, lesson.title, topic.title, ...topic.terms, text].join('\n'))};
  }));
}
export function excerpt(text, query, length = 190) {
  const normalized = normalize(text);
  const hits = tokens(query).map(token => normalized.indexOf(token)).filter(i => i >= 0);
  const phrasePosition = normalized.indexOf(tokens(query).join(' '));
  const position = tokens(query).length && phrasePosition >= 0 ? phrasePosition : hits.length ? Math.min(...hits) : 0;
  const start = Math.max(0, position - 45);
  const end = Math.min(text.length, start + length);
  return `${start ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}
export function search(index, query) {
  const words = tokens(query);
  if (!words.length) return [];
  const phrase = normalize(query).trim();
  return index.filter(item => words.every(word => item.haystack.includes(word)))
    .map(item => ({...item, score:
      (item.title.includes(phrase) ? 30 : 0) +
      (normalize(item.topic.code).includes(phrase) ? 12 : 0) +
      words.reduce((sum, word) => sum + (item.title.includes(word) ? 8 : 0) + (item.aliases.includes(word) ? 4 : 0), 0),
      snippet: excerpt(item.text, query)}))
    .sort((a, b) => b.score - a.score);
}
