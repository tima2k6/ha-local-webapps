"""Expose raw Sony input URI for ownership checks without inferring from labels."""
from pathlib import Path
path=Path(r'\\192.168.2.125\config\configuration.yaml')
text=path.read_text(encoding='utf-8')
key='        unique_id: sony_tv_current_input\n'
assert key in text
old='        json_attributes_path: "$.result[0]"\n        json_attributes:\n          - uri\n          - title\n'
start=text.index(key);end=text.index('        value_template:',start)
text=text[:start]+text[start:end].replace(old,'')+text[end:]
if 'json_attributes:' not in text[text.index(key):text.index(key)+140]:
    text=text.replace(key,key+'        json_attributes:\n          - result\n',1)
    path.write_text(text,encoding='utf-8')
    print('Sony current-input sensor now exposes its raw playing-content result.')
else:print('Input metadata is already present.')
