/**
 * AI Content Automation – Admin JavaScript
 * Handles generation, field filling, preview, and bulk processing.
 */
(function ($) {
    'use strict';

    const config = window.aicaConfig || {};
    let currentResult = null;

    // ─── Field Filler Engine ────────────────────────────────

    const FieldFiller = {
        fill(instructions) {
            const results = [];
            for (const instr of instructions) {
                try {
                    const filled = this.fillField(instr);
                    results.push({ ...instr, filled });
                } catch (e) {
                    results.push({ ...instr, filled: false, error: e.message });
                }
            }
            return results;
        },

        fillField(instr) {
            const { targetType, targetField, value, selector } = instr;

            if (targetType === 'acf') {
                return this.fillACF(targetField, value);
            }
            if (targetType === 'wysiwyg') {
                return this.fillWysiwyg(targetField, value, selector);
            }
            if (targetType === 'gutenberg') {
                return this.fillGutenberg(value);
            }
            if (targetType === 'post_field') {
                return this.fillPostField(targetField, value);
            }

            const el = document.querySelector(selector || `[name="${targetField}"]`);
            if (el) {
                this.setElementValue(el, value);
                return true;
            }
            return false;
        },

        fillACF(fieldName, value) {
            const wrappers = document.querySelectorAll(`[data-name="${fieldName}"]`);
            if (wrappers.length === 0) {
                const byKey = document.querySelector(`[data-key*="${fieldName}"]`);
                if (byKey) {
                    const input = byKey.querySelector('textarea, input[type="text"]');
                    if (input) { this.setElementValue(input, value); return true; }
                }
                return false;
            }

            wrappers.forEach(wrapper => {
                const wysiwyg = wrapper.querySelector('.wp-editor-area');
                if (wysiwyg) {
                    this.fillWysiwygElement(wysiwyg, value);
                    return;
                }
                const textarea = wrapper.querySelector('textarea');
                const input = wrapper.querySelector('input[type="text"]');
                if (textarea) this.setElementValue(textarea, value);
                else if (input) this.setElementValue(input, value);
            });
            return true;
        },

        fillWysiwyg(fieldName, value, selector) {
            const editorId = this.findEditorId(fieldName, selector);
            if (editorId && typeof tinymce !== 'undefined') {
                const editor = tinymce.get(editorId);
                if (editor) {
                    editor.setContent(value);
                    return true;
                }
            }
            const el = document.querySelector(selector || `#${fieldName}, .wp-editor-area`);
            if (el) { this.setElementValue(el, value); return true; }
            return false;
        },

        fillWysiwygElement(el, value) {
            const editorId = el.id;
            if (editorId && typeof tinymce !== 'undefined') {
                const editor = tinymce.get(editorId);
                if (editor) { editor.setContent(value); return true; }
            }
            this.setElementValue(el, value);
            return true;
        },

        fillGutenberg(content) {
            if (typeof wp !== 'undefined' && wp.data && wp.data.dispatch) {
                const blocks = wp.blocks.parse(content);
                wp.data.dispatch('core/block-editor').resetBlocks(blocks);
                return true;
            }
            return false;
        },

        fillPostField(fieldName, value) {
            const map = {
                post_title: '#title',
                post_content: '#content',
                post_excerpt: '#excerpt',
            };
            const el = document.querySelector(map[fieldName] || `#${fieldName}`);
            if (!el) return false;
            this.setElementValue(el, value);
            return true;
        },

        findEditorId(fieldName, selector) {
            if (selector) {
                const el = document.querySelector(selector);
                if (el) {
                    const area = el.querySelector('.wp-editor-area') || el;
                    return area.id;
                }
            }
            const area = document.querySelector(`#${fieldName}, [name="${fieldName}"]`);
            return area ? area.id : null;
        },

        setElementValue(el, value) {
            el.value = value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        },
    };

    // ─── Generation Panel ───────────────────────────────────

    function initGenerationPanel($panel) {
        const itemType = $panel.data('item-type');
        const itemId = $panel.data('item-id');
        const taxonomy = $panel.data('taxonomy') || '';

        loadPrompts($panel.find('.aica-prompt-select'));

        $panel.find('.aica-generate-btn').on('click', function () {
            const promptId = $panel.find('.aica-prompt-select').val();
            const applyMode = $panel.find('.aica-apply-mode').val();

            if (!promptId) {
                alert('Please select a prompt.');
                return;
            }

            $panel.find('.aica-status').show();
            $panel.find('.aica-status-text').text(config.strings.generating);
            $panel.find('.aica-preview').hide();
            $(this).prop('disabled', true);

            wp.apiFetch({
                path: '/ai-content/v1/generate',
                method: 'POST',
                data: { itemType, itemId, taxonomy, promptId, applyMode },
            }).then(function (response) {
                currentResult = response;
                $panel.find('.aica-status').hide();
                $panel.find('.aica-generate-btn').prop('disabled', false);

                if (response.result && response.result.status === 'success') {
                    showPreview($panel, response);
                } else {
                    alert(response.result?.error || config.strings.error);
                }
            }).catch(function (err) {
                $panel.find('.aica-status').hide();
                $panel.find('.aica-generate-btn').prop('disabled', false);
                alert(err.message || config.strings.error);
            });
        });

        $panel.find('.aica-apply-btn').on('click', function () {
            if (!currentResult || !currentResult.fillInstructions) return;
            const results = FieldFiller.fill(currentResult.fillInstructions);
            const filled = results.filter(r => r.filled).length;
            alert(`Applied content to ${filled} of ${results.length} fields. Review and save when ready.`);
            $panel.find('.aica-preview').hide();
        });

        $panel.find('.aica-cancel-btn').on('click', function () {
            $panel.find('.aica-preview').hide();
            currentResult = null;
        });
    }

    function showPreview($panel, response) {
        const $preview = $panel.find('.aica-preview');
        const $content = $panel.find('.aica-preview-content');
        $content.empty();

        const generated = response.result.generatedContent || {};
        for (const [key, value] of Object.entries(generated)) {
            $content.append(
                `<div class="aica-preview-field">
                    <strong>${escapeHtml(key)}</strong>
                    <div class="aica-preview-value">${escapeHtml(String(value).substring(0, 500))}${String(value).length > 500 ? '...' : ''}</div>
                </div>`
            );
        }

        const mapped = response.result.mappedFields || [];
        if (mapped.length > 0) {
            $content.append('<h5>Field Mapping</h5>');
            for (const field of mapped) {
                const status = field.applied ? '✓' : (field.skippedReason ? '○ ' + field.skippedReason : '○');
                $content.append(
                    `<div class="aica-mapping-row">
                        <span>${escapeHtml(field.aiOutputKey)} → ${escapeHtml(field.targetField)}</span>
                        <span class="aica-mapping-status">${escapeHtml(status)}</span>
                    </div>`
                );
            }
        }

        $preview.show();
    }

    function loadPrompts($select) {
        wp.apiFetch({ path: '/ai-content/v1/prompts' })
            .then(function (prompts) {
                if (prompts && prompts.error) {
                    $select.empty().append(`<option value="">${escapeHtml(prompts.error)}</option>`);
                    return;
                }
                $select.empty().append('<option value="">Select a prompt...</option>');
                (prompts || []).forEach(function (p) {
                    $select.append(`<option value="${p.id}">${escapeHtml(p.name)}</option>`);
                });
                if (config.defaultPromptId) {
                    $select.val(config.defaultPromptId);
                }
            })
            .catch(function (err) {
                const message = err.message || 'Failed to load prompts';
                $select.empty().append(`<option value="">${escapeHtml(message)}</option>`);
            });
    }

    // ─── Bulk Processing ────────────────────────────────────

    function initBulkPage() {
        const $page = $('.aica-bulk-page');
        if (!$page.length) return;

        loadPrompts($('#aica-bulk-prompt'));

        $('#aica-bulk-load-items').on('click', function () {
            const contentType = $('#aica-bulk-content-type').val();
            loadBulkItems(contentType);
        });

        $('#aica-bulk-select-all').on('change', function () {
            $('#aica-bulk-items-tbody input[type="checkbox"]').prop('checked', this.checked);
            updateBulkStartButton();
        });

        $(document).on('change', '#aica-bulk-items-tbody input[type="checkbox"]', updateBulkStartButton);

        $('#aica-bulk-start').on('click', startBulkGeneration);
        $('#aica-bulk-retry').on('click', retryBulkJob);
    }

    function loadBulkItems(contentType) {
        const $tbody = $('#aica-bulk-items-tbody');
        $tbody.empty();

        let taxonomy = 'category';
        let postType = 'post';
        if (contentType === 'product') postType = 'product';

        const items = getLocalItems(contentType);

        items.forEach(function (item) {
            $tbody.append(
                `<tr>
                    <td><input type="checkbox" value="${item.id}" data-label="${escapeHtml(item.name)}" data-type="${item.type}" data-taxonomy="${item.taxonomy || ''}" /></td>
                    <td>${escapeHtml(item.name)}</td>
                    <td>${escapeHtml(item.status || '')}</td>
                </tr>`
            );
        });

        $('#aica-bulk-items-list').show();
        updateBulkStartButton();
    }

    function getLocalItems(contentType) {
        const items = [];
        if (contentType === 'category') {
            $('table.wp-list-table tbody tr').each(function () {
                const $row = $(this);
                const name = $row.find('.row-title, td strong a, td.column-name a').first().text().trim();
                const editLink = $row.find('a.row-title, td strong a, td.column-name a').first().attr('href') || '';
                const idMatch = editLink.match(/tag_ID=(\d+)/) || editLink.match(/term_id=(\d+)/);
                if (idMatch && name) {
                    items.push({ id: idMatch[1], name, type: 'term', taxonomy: 'category' });
                }
            });
        }
        return items;
    }

    function updateBulkStartButton() {
        const checked = $('#aica-bulk-items-tbody input[type="checkbox"]:checked').length;
        $('#aica-bulk-start').prop('disabled', checked === 0);
    }

    let bulkJobId = null;
    let pollInterval = null;

    function startBulkGeneration() {
        const promptId = $('#aica-bulk-prompt').val();
        const applyMode = $('#aica-bulk-apply-mode').val();
        if (!promptId) { alert('Select a prompt.'); return; }

        const items = [];
        $('#aica-bulk-items-tbody input:checked').each(function () {
            items.push({
                itemId: parseInt($(this).val()),
                itemType: $(this).data('type') || 'term',
                itemLabel: $(this).data('label'),
                taxonomy: $(this).data('taxonomy') || 'category',
            });
        });

        $('#aica-bulk-start').prop('disabled', true);
        $('#aica-bulk-progress').show();

        wp.apiFetch({
            path: '/ai-content/v1/bulk/generate',
            method: 'POST',
            data: {
                promptId,
                applyMode,
                name: `Bulk - ${new Date().toLocaleString()}`,
                items,
            },
        }).then(function (response) {
            bulkJobId = response.job?.id;
            if (bulkJobId) {
                pollInterval = setInterval(pollBulkStatus, 2000);
            }
        }).catch(function (err) {
            alert('Bulk generation failed: ' + (err.message || 'Unknown error'));
            $('#aica-bulk-start').prop('disabled', false);
        });
    }

    function pollBulkStatus() {
        if (!bulkJobId) return;
        wp.apiFetch({ path: `/ai-content/v1/bulk/status/${bulkJobId}` })
            .then(function (job) {
                const stats = job.stats || {};
                $('#aica-stat-completed').text(stats.completed || 0);
                $('#aica-stat-processing').text(stats.processing || 0);
                $('#aica-stat-pending').text(stats.pending || 0);
                $('#aica-stat-failed').text(stats.failed || 0);

                const total = stats.total || 1;
                const progress = ((stats.completed || 0) / total) * 100;
                $('.aica-progress-fill').css('width', progress + '%');

                if (job.status === 'completed') {
                    clearInterval(pollInterval);
                    $('#aica-bulk-start').prop('disabled', false);
                    if (stats.failed > 0) {
                        $('#aica-bulk-retry').show();
                    }
                }
            });
    }

    function retryBulkJob() {
        if (!bulkJobId) return;
        wp.apiFetch({
            path: `/ai-content/v1/bulk/retry/${bulkJobId}`,
            method: 'POST',
        }).then(function () {
            $('#aica-bulk-retry').hide();
            pollInterval = setInterval(pollBulkStatus, 2000);
        });
    }

    // ─── Connection Test ────────────────────────────────────

    function initConnectionTest() {
        $('#aica-test-connection, #aica-dashboard-test').on('click', function () {
            const $status = $(this).siblings('[id$="-status"], [id$="-status-text"]');
            $status.text('Testing...');
            wp.apiFetch({ path: '/ai-content/v1/test-connection' })
                .then(function (result) {
                    $status.text(result.success ? '✓ Connected' : '✕ ' + result.message)
                        .css('color', result.success ? 'green' : 'red');
                })
                .catch(function () {
                    $status.text('✕ Connection failed').css('color', 'red');
                });
        });
    }

    // ─── Utilities ──────────────────────────────────────────

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ─── Init ───────────────────────────────────────────────

    $(document).ready(function () {
        $('.aica-generation-panel').each(function () {
            initGenerationPanel($(this));
        });
        initBulkPage();
        initConnectionTest();
    });

})(jQuery);
