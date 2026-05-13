import { encodeView, decodeView } from './viewShareCodec'

describe('viewShareCodec - encode', () => {
  it('returns empty string for empty / default-only snapshot', () => {
    expect(encodeView()).toBe('')
    expect(encodeView({})).toBe('')
    expect(encodeView({ filters: {}, view: {} })).toBe('')
  })

  it('strips empty arrays, null, undefined, empty strings', () => {
    expect(encodeView({
      filters: { labels: [], authors: null, searchQuery: '', dueStatus: undefined }
    })).toBe('')
  })

  it('keeps false / 0 for non-empty numeric/boolean values', () => {
    // dueSoonDays = 0 is non-default (default 7) and a valid number — must encode.
    expect(encodeView({ view: { dueSoonDays: 0 } })).toBe('dueSoon=0')
  })

  it('strips view defaults so URLs stay short', () => {
    expect(encodeView({
      view: { colorMode: 'state', grouping: 'none', linkMode: 'none', dueSoonDays: 7 }
    })).toBe('')
  })

  it('encodes single filter', () => {
    expect(encodeView({ filters: { searchQuery: 'foo' } })).toBe('q=foo')
  })

  it('joins multiple segments with "/" (deterministic key order)', () => {
    // Order follows FILTER_MAP / DATE_MAP / VIEW_MAP iteration.
    expect(encodeView({
      filters: { labels: ['Bug'], dueStatus: 'overdue' },
      view: { grouping: 'author', colorMode: 'priority' }
    })).toBe('label=Bug/due=overdue/color=priority/group=author')
  })

  it('aliases the internal "tag" value to "label" in color/group (UI is named "Label" already)', () => {
    expect(encodeView({ view: { grouping: 'tag', colorMode: 'tag' } }))
      .toBe('color=label/group=label')
  })

  it('joins array values with commas (no percent-encoding of the separator)', () => {
    expect(encodeView({ filters: { labels: ['Bug', 'Critical', 'Frontend'] } }))
      .toBe('label=Bug,Critical,Frontend')
  })

  it('percent-encodes spaces and special chars in scalar values', () => {
    expect(encodeView({ filters: { searchQuery: 'memory leak' } })).toBe('q=memory%20leak')
    expect(encodeView({ filters: { searchQuery: 'a=b&c?d/e' } }))
      .toBe('q=a%3Db%26c%3Fd%2Fe')
  })

  it('percent-encodes each array item independently (commas stay literal)', () => {
    expect(encodeView({ filters: { labels: ['To do', 'In progress'] } }))
      .toBe('label=To%20do,In%20progress')
  })

  it('encodes unicode and emoji safely', () => {
    expect(encodeView({ filters: { searchQuery: '中文' } })).toBe('q=%E4%B8%AD%E6%96%87')
    expect(encodeView({ filters: { labels: ['café', '🚀'] } }))
      .toBe('label=caf%C3%A9,%F0%9F%9A%80')
  })

  it('only emits closed=1 when includeClosed is true (false is the default → omitted)', () => {
    expect(encodeView({ filters: { includeClosed: true } })).toBe('closed=1')
    expect(encodeView({ filters: { includeClosed: false } })).toBe('')
  })

  it('encodes date filters and omits "none" modes', () => {
    expect(encodeView({
      filters: { dateFilters: { createdMode: 'last', createdDays: 30, updatedMode: 'none' } }
    })).toBe('created=last/createdDays=30')
  })

  it('preserves @me / @unassigned / @deactivated sentinels (no @ escaping)', () => {
    expect(encodeView({ filters: { assignees: ['@me', 'Alice', '@deactivated'] } }))
      .toBe('assignee=%40me,Alice,%40deactivated')
  })
})

describe('viewShareCodec - decode', () => {
  it('returns null snapshot + no warnings for empty input', () => {
    expect(decodeView()).toEqual({ snapshot: null, warnings: [] })
    expect(decodeView('')).toEqual({ snapshot: null, warnings: [] })
    expect(decodeView('   ')).toEqual({ snapshot: null, warnings: [] })
    expect(decodeView('/')).toEqual({ snapshot: null, warnings: [] })
    expect(decodeView('//')).toEqual({ snapshot: null, warnings: [] })
  })

  it('parses a single segment', () => {
    const { snapshot, warnings } = decodeView('q=foo')
    expect(snapshot).toEqual({ filters: { searchQuery: 'foo' } })
    expect(warnings).toEqual([])
  })

  it('handles leading slashes and consecutive separators', () => {
    const { snapshot } = decodeView('//q=foo//label=Bug///')
    expect(snapshot).toEqual({ filters: { searchQuery: 'foo', labels: ['Bug'] } })
  })

  it('roundtrips a full snapshot', () => {
    const original = {
      filters: {
        includeClosed: true,
        labels: ['Bug', 'Critical'],
        excludedLabels: ['WIP'],
        authors: ['@me'],
        assignees: ['Alice', 'Bob'],
        milestones: ['1.0'],
        priorities: ['1 - High'],
        types: ['Feature'],
        participants: ['Carol'],
        statuses: ['In progress'],
        subscription: 'subscribed',
        dueStatus: 'overdue',
        spentMode: 'has',
        budgetMode: 'over',
        estimateBucket: 'lt1h',
        taskMode: 'in_progress',
        mrMode: 'has',
        searchQuery: 'foo bar',
        dateFilters: { createdMode: 'last', createdDays: 7 }
      },
      view: { colorMode: 'priority', grouping: 'assignee', linkMode: 'dependency', dueSoonDays: 14 }
    }
    const encoded = encodeView(original)
    const { snapshot, warnings } = decodeView(encoded)
    expect(warnings).toEqual([])
    expect(snapshot).toEqual(original)
  })

  it('decodes percent-encoded spaces and unicode in scalars and arrays', () => {
    const { snapshot } = decodeView('q=memory%20leak/label=To%20do,In%20progress')
    expect(snapshot.filters.searchQuery).toBe('memory leak')
    expect(snapshot.filters.labels).toEqual(['To do', 'In progress'])
  })

  it('decodes emoji and CJK', () => {
    const { snapshot } = decodeView('q=%F0%9F%9A%80/label=caf%C3%A9,%E4%B8%AD%E6%96%87')
    expect(snapshot.filters.searchQuery).toBe('🚀')
    expect(snapshot.filters.labels).toEqual(['café', '中文'])
  })

  it('parses includeClosed=1 and =true as true', () => {
    expect(decodeView('closed=1').snapshot.filters.includeClosed).toBe(true)
    expect(decodeView('closed=true').snapshot.filters.includeClosed).toBe(true)
    expect(decodeView('closed=0').snapshot.filters.includeClosed).toBe(false)
    expect(decodeView('closed=false').snapshot.filters.includeClosed).toBe(false)
  })

  it('preserves an empty scalar value as empty string', () => {
    // Edge case: `q=` is technically valid; decoder hands back ''.
    const { snapshot } = decodeView('q=')
    expect(snapshot.filters.searchQuery).toBe('')
  })

  it('returns last value when a key is duplicated and warns', () => {
    const { snapshot, warnings } = decodeView('q=first/q=second')
    expect(snapshot.filters.searchQuery).toBe('second')
    expect(warnings.some(w => w.includes('Duplicate URL key "q"'))).toBe(true)
  })

  it('handles single-element arrays', () => {
    expect(decodeView('label=Bug').snapshot.filters.labels).toEqual(['Bug'])
  })

  it('drops empty array entries from trailing/leading commas', () => {
    // Codec splits on "," and filters falsy → "Bug,,Critical" loses the empty entry.
    expect(decodeView('label=Bug,,Critical').snapshot.filters.labels).toEqual(['Bug', 'Critical'])
    expect(decodeView('label=,Bug,').snapshot.filters.labels).toEqual(['Bug'])
  })
})

describe('viewShareCodec - decode: validation + warnings', () => {
  it('rejects legacy "?key=val&key=val" URLs with a single warning', () => {
    const { snapshot, warnings } = decodeView('color=last_updated&group=assignee')
    expect(snapshot).toBe(null)
    expect(warnings.length).toBe(1)
    expect(warnings[0]).toMatch(/unsupported "\?" \/ "&"/)
  })

  it('rejects a path containing a "?"', () => {
    const { snapshot, warnings } = decodeView('q=foo?bar=baz')
    expect(snapshot).toBe(null)
    expect(warnings[0]).toMatch(/unsupported/)
  })

  it('warns and ignores unknown URL keys', () => {
    const { snapshot, warnings } = decodeView('colour=red/q=foo')
    expect(snapshot).toEqual({ filters: { searchQuery: 'foo' } })
    expect(warnings.some(w => w.includes('Unknown URL key "colour"'))).toBe(true)
  })

  it('warns and ignores malformed segments without "="', () => {
    const { snapshot, warnings } = decodeView('justatoken/q=foo')
    expect(snapshot).toEqual({ filters: { searchQuery: 'foo' } })
    expect(warnings.some(w => w.includes('malformed segment "justatoken"'))).toBe(true)
  })

  it('drops invalid color/group/links enum values with a warning', () => {
    const { snapshot, warnings } = decodeView('color=banana/group=elephant/links=mystery')
    expect(snapshot).toBe(null) // nothing valid landed
    expect(warnings.length).toBe(3)
    expect(warnings.find(w => w.includes('color="banana"'))).toBeTruthy()
    expect(warnings.find(w => w.includes('group="elephant"'))).toBeTruthy()
    expect(warnings.find(w => w.includes('links="mystery"'))).toBeTruthy()
  })

  it('accepts scoped:<Prefix> grouping values', () => {
    const { snapshot, warnings } = decodeView('group=scoped:Component')
    expect(snapshot).toEqual({ view: { grouping: 'scoped:Component' } })
    expect(warnings).toEqual([])
  })

  it('decodes "label" alias back to internal "tag" for color/group', () => {
    const { snapshot, warnings } = decodeView('color=label/group=label')
    expect(snapshot).toEqual({ view: { colorMode: 'tag', grouping: 'tag' } })
    expect(warnings).toEqual([])
  })

  it('still accepts the raw internal value "tag" for backward compat', () => {
    // Old links / hand-written URLs using `tag` directly should still work.
    const { snapshot, warnings } = decodeView('color=tag/group=tag')
    expect(snapshot).toEqual({ view: { colorMode: 'tag', grouping: 'tag' } })
    expect(warnings).toEqual([])
  })

  it('drops invalid filter enum values (dueStatus, spentMode, ...) with a warning', () => {
    const { snapshot, warnings } = decodeView('due=banana/spent=maybe')
    expect(snapshot).toBe(null)
    expect(warnings.find(w => w.includes('Invalid due="banana"'))).toBeTruthy()
    expect(warnings.find(w => w.includes('Invalid spent="maybe"'))).toBeTruthy()
  })

  it('does NOT enum-validate free-form filter arrays (label, milestone, etc.)', () => {
    // Labels can be anything — codec must not reject odd-looking strings.
    const { snapshot, warnings } = decodeView('label=anything-goes,!!,123/milestone=v0.0.0-rc1')
    expect(warnings).toEqual([])
    expect(snapshot.filters.labels).toEqual(['anything-goes', '!!', '123'])
    expect(snapshot.filters.milestones).toEqual(['v0.0.0-rc1'])
  })

  it('warns when dueSoon / createdDays are not numeric', () => {
    const { snapshot, warnings } = decodeView('dueSoon=soon/createdDays=lots')
    expect(snapshot).toBe(null)
    expect(warnings.find(w => w.includes('Invalid dueSoon="soon"'))).toBeTruthy()
    expect(warnings.find(w => w.includes('Invalid createdDays="lots"'))).toBeTruthy()
  })

  it('preserves valid values around invalid ones (partial parse)', () => {
    const { snapshot, warnings } = decodeView('color=priority/group=banana/q=foo')
    expect(snapshot).toEqual({
      filters: { searchQuery: 'foo' },
      view: { colorMode: 'priority' }
    })
    expect(warnings.length).toBe(1)
    expect(warnings[0]).toMatch(/group="banana"/)
  })

  it('accumulates multiple warnings without throwing', () => {
    const { snapshot, warnings } = decodeView('unknown1=a/color=junk/unknown2=b/badseg/q=ok')
    expect(snapshot).toEqual({ filters: { searchQuery: 'ok' } })
    expect(warnings.length).toBe(4)
  })

  it('does not crash on extreme inputs', () => {
    const longVal = 'x'.repeat(5000)
    expect(() => decodeView(`q=${longVal}`)).not.toThrow()
    expect(() => decodeView(longVal)).not.toThrow() // no '=' → malformed warning, no crash
    expect(() => decodeView('////')).not.toThrow()
    expect(() => decodeView('=foo')).not.toThrow() // empty key
    expect(() => decodeView('==')).not.toThrow()
  })

  it('handles a value containing "=" (only first "=" splits key/value)', () => {
    // Plus signs in URL values are conventionally spaces; we use encodeURIComponent so
    // a literal '=' must be percent-encoded — here we just verify the splitter.
    const { snapshot } = decodeView('q=a=b=c')
    expect(snapshot.filters.searchQuery).toBe('a=b=c')
  })

  it('returns null snapshot when every parsed pair was invalid', () => {
    const { snapshot } = decodeView('color=junk/links=bogus')
    expect(snapshot).toBe(null)
  })
})

describe('viewShareCodec - roundtrip edge cases', () => {
  it('values containing reserved chars survive encode → decode', () => {
    const original = { filters: { searchQuery: 'a=b&c?d/e + space' } }
    const { snapshot } = decodeView(encodeView(original))
    expect(snapshot.filters.searchQuery).toBe('a=b&c?d/e + space')
  })

  it('array items with reserved/special chars roundtrip independently', () => {
    const original = { filters: { labels: ['a/b', 'c=d', 'e&f', 'g?h', 'i j', 'k,l'] } }
    const encoded = encodeView(original)
    // Commas inside an item must be escaped to %2C; the codec's join uses literal commas as separators.
    expect(encoded).toMatch(/^label=/)
    const { snapshot, warnings } = decodeView(encoded)
    expect(warnings).toEqual([])
    expect(snapshot.filters.labels).toEqual(['a/b', 'c=d', 'e&f', 'g?h', 'i j', 'k,l'])
  })

  it('unicode roundtrips intact', () => {
    const original = {
      filters: { labels: ['🚀', '中文', 'Здравствуй'], searchQuery: 'café ☕' }
    }
    const { snapshot } = decodeView(encodeView(original))
    expect(snapshot.filters.labels).toEqual(['🚀', '中文', 'Здравствуй'])
    expect(snapshot.filters.searchQuery).toBe('café ☕')
  })

  it('default values are stripped, then default-only inputs reconstruct as empty', () => {
    const original = {
      filters: { includeClosed: false, labels: [] },
      view: { colorMode: 'state', grouping: 'none', linkMode: 'none', dueSoonDays: 7 }
    }
    expect(encodeView(original)).toBe('')
    expect(decodeView(encodeView(original))).toEqual({ snapshot: null, warnings: [] })
  })

  it('a very large but valid snapshot encodes and decodes without warnings', () => {
    const labels = Array.from({ length: 200 }, (_, i) => `lbl-${i}`)
    const { snapshot, warnings } = decodeView(encodeView({ filters: { labels } }))
    expect(warnings).toEqual([])
    expect(snapshot.filters.labels).toEqual(labels)
  })
})
