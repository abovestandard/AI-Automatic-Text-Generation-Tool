/**
 * AI Content Automation – Admin JavaScript
 * Handles generation, field filling, preview, and bulk processing.
 */
(function ($) {
    'use strict';

    const config = window.aicaConfig || {};
    let currentResult = null;
    let uploadedImage = null; // { base64, mimeType, previewUrl }

    // ─── Image Upload Helper ────────────────────────────────

    function initImageUpload($input, $preview, $previewImg, $removeBtn, onChange) {
        if (!$input.length) return;

        $input.on('change', function () {
            const file = this.files && this.files[0];
            if (!file) return;

            if (!file.type.startsWith('image/')) {
                alert('Please select an image file.');
                this.value = '';
                return;
            }

            if (file.size > 10 * 1024 * 1024) {
                alert('Image must be smaller than 10 MB.');
                this.value = '';
                return;
            }

            const reader = new FileReader();
            reader.onload = function (e) {
                const dataUrl = e.target.result;
                const base64 = dataUrl.split(',')[1];
                uploadedImage = {
                    base64,
                    mimeType: file.type,
                    previewUrl: dataUrl,
                    key: 'uploaded_image',
                };
                if ($previewImg.length) $previewImg.attr('src', dataUrl);
                if ($preview.length) $preview.show();
                if (onChange) onChange(uploadedImage);
            };
            reader.readAsDataURL(file);
        });

        if ($removeBtn.length) {
            $removeBtn.on('click', function () {
                uploadedImage = null;
                $input.val('');
                if ($preview.length) $preview.hide();
                if ($previewImg.length) $previewImg.attr('src', '');
                if (onChange) onChange(null);
            });
        }
    }

    function getUploadedImages() {
        if (!uploadedImage) return [];
        return [{
            key: uploadedImage.key,
            base64: uploadedImage.base64,
            mimeType: uploadedImage.mimeType,
        }];
    }

    function resetUploadedImage($input, $preview, $previewImg) {
        uploadedImage = null;
        if ($input && $input.length) $input.val('');
        if ($preview && $preview.length) $preview.hide();
        if ($previewImg && $previewImg.length) $previewImg.attr('src', '');
    }

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

        initImageUpload(
            $panel.find('.aica-panel-upload-image'),
            $panel.find('.aica-panel-image-preview'),
            $panel.find('.aica-panel-image-preview img'),
            $panel.find('.aica-panel-image-remove')
        );

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
                data: {
                    itemType,
                    itemId,
                    taxonomy,
                    promptId,
                    applyMode,
                    uploadedImages: getUploadedImages(),
                    acfAuto: $panel.find('.aica-panel-acf-auto-cb').is(':checked'),
                },
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
            if (!currentResult || !currentResult.result) return;

            const mappedFields = currentResult.result.mappedFields || [];
            if (!mappedFields.length) {
                alert('No mapped fields to save.');
                return;
            }

            const $btn = $(this);
            const applyMode = $panel.find('.aica-apply-mode').val();
            const saveMode  = applyMode === 'preview' ? 'replace' : applyMode;

            $btn.prop('disabled', true).text('Saving...');

            wp.apiFetch({
                path: '/ai-content/v1/save-content',
                method: 'POST',
                data: {
                    itemType,
                    itemId,
                    taxonomy,
                    applyMode: saveMode,
                    mappedFields,
                },
            }).then(function (result) {
                $btn.prop('disabled', false).text(config.strings.apply || 'Save to ACF Fields');
                if (result.saved > 0) {
                    alert(`Saved ${result.saved} of ${result.total} fields successfully. The page will reload to show updated values.`);
                    location.reload();
                } else {
                    const reasons = (result.results || [])
                        .filter(r => !r.saved)
                        .map(r => `${r.targetField}: ${r.reason || 'failed'}`)
                        .join('\n');
                    alert(`Could not save fields.\n${reasons || 'Check your field mappings and ACF field paths.'}`);
                }
                $panel.find('.aica-preview').hide();
                currentResult = null;
            }).catch(function (err) {
                $btn.prop('disabled', false).text(config.strings.apply || 'Save to ACF Fields');
                alert('Save failed: ' + (err.message || 'Unknown error'));
            });
        });

        $panel.find('.aica-cancel-btn').on('click', function () {
            $panel.find('.aica-preview').hide();
            currentResult = null;
        });
    }

    function formatPreviewValue(value) {
        if (value === null || value === undefined) return '';
        if (typeof value === 'object') {
            try { return JSON.stringify(value, null, 2); } catch (e) { return String(value); }
        }
        const str = String(value);
        const trimmed = str.trim();
        if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
            try { return JSON.stringify(JSON.parse(trimmed), null, 2); } catch (e) { return str; }
        }
        return str;
    }

    function showPreview($panel, response) {
        const $preview = $panel.find('.aica-preview');
        const $content = $panel.find('.aica-preview-content');
        $content.empty();

        if (response.acfMeta) {
            const mode = response.acfMeta.autoMode
                ? `ACF Auto Mode: ${response.acfMeta.fieldCount} field(s) detected`
                : 'Manual prompt mode (ACF Auto off or no fields found)';
            $content.append(`<p class="aica-field-hint"><strong>${escapeHtml(mode)}</strong></p>`);
        }

        const generated = response.result.generatedContent || {};
        for (const [key, value] of Object.entries(generated)) {
            const display = formatPreviewValue(value);
            $content.append(
                `<div class="aica-preview-field">
                    <strong>${escapeHtml(key)}</strong>
                    <div class="aica-preview-value">${escapeHtml(display.substring(0, 2000))}${display.length > 2000 ? '...' : ''}</div>
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

    // ─── Shared Helpers ─────────────────────────────────────

    function parseContentType(value) {
        if (!value || value.indexOf(':') === -1) return null;
        const parts = value.split(':');
        return { kind: parts[0], slug: parts[1] };
    }

    function getItemTypeFromKind(kind) {
        return kind === 'taxonomy' ? 'term' : 'post';
    }

    function loadItemsForType(contentType, $select, placeholder) {
        const parsed = parseContentType(contentType);
        if (!parsed) {
            $select.prop('disabled', true).empty()
                .append(`<option value="">${escapeHtml(placeholder || 'Select a content type first...')}</option>`);
            return Promise.resolve([]);
        }

        $select.prop('disabled', true).empty()
            .append('<option value="">Loading...</option>');

        return wp.apiFetch({
            path: `/ai-content/v1/items?type=${encodeURIComponent(parsed.kind)}&slug=${encodeURIComponent(parsed.slug)}`,
        }).then(function (items) {
            $select.empty().append(`<option value="">${escapeHtml(placeholder || 'Select an item...')}</option>`);
            (items || []).forEach(function (item) {
                $select.append(
                    `<option value="${item.id}" data-edit-url="${escapeHtml(item.editUrl || '')}" data-label="${escapeHtml(item.label)}">${escapeHtml(item.label)}</option>`
                );
            });
            $select.prop('disabled', false);
            return items || [];
        }).catch(function (err) {
            $select.empty().append(`<option value="">${escapeHtml(err.message || 'Failed to load items')}</option>`);
            return [];
        });
    }

    // ─── Single Item Generate Page ──────────────────────────

    let generateResult = null;

    function initGeneratePage() {
        const $page = $('.aica-generate-page');
        if (!$page.length) return;

        const $contentType = $('#aica-content-type');
        const $contentItem = $('#aica-content-item');
        const $generateBtn = $('#aica-generate-start');
        const $editLink = $('#aica-edit-item-link');

        initImageUpload(
            $('#aica-upload-image'),
            $('#aica-image-preview'),
            $('#aica-image-preview-img'),
            $('#aica-image-remove')
        );

        loadPrompts($('#aica-generate-prompt'));

        $contentType.on('change', function () {
            const type = $(this).val();
            $generateBtn.prop('disabled', true);
            $editLink.hide();
            $('#aica-generate-preview').hide();
            generateResult = null;
            resetUploadedImage($('#aica-upload-image'), $('#aica-image-preview'), $('#aica-image-preview-img'));

            loadItemsForType(type, $contentItem, 'Select an item...').then(function (items) {
                $('#aica-item-count').text(items.length ? `${items.length} items available` : 'No items found');
            });
        });

        $contentItem.on('change', function () {
            const hasItem = !!$(this).val();
            $generateBtn.prop('disabled', !hasItem);
            const editUrl = $(this).find(':selected').data('edit-url');
            if (editUrl) {
                $editLink.attr('href', editUrl).show();
            } else {
                $editLink.hide();
            }
            if ($('#aica-acf-auto-mode').is(':checked')) {
                loadAcfAutoHint();
            }
        });

        $contentType.on('change', function () {
            $('#aica-acf-auto-hint').text('');
        });

        $('#aica-acf-auto-mode').on('change', loadAcfAutoHint);

        function loadAcfAutoHint() {
            const contentType = $contentType.val();
            const parsed = parseContentType(contentType);
            const itemId = parseInt($contentItem.val(), 10);
            if (!parsed || !$('#aica-acf-auto-mode').is(':checked')) {
                $('#aica-acf-auto-hint').text('');
                return;
            }
            const itemType = getItemTypeFromKind(parsed.kind);
            const taxonomy = parsed.kind === 'taxonomy' ? parsed.slug : '';
            let path = `/ai-content/v1/acf-schema?type=${encodeURIComponent(parsed.kind)}&slug=${encodeURIComponent(parsed.slug)}`;
            if (itemId) {
                path += `&itemId=${itemId}&itemType=${encodeURIComponent(itemType)}&taxonomy=${encodeURIComponent(taxonomy)}`;
            }
            $('#aica-acf-auto-hint').text('Loading ACF fields...');
            wp.apiFetch({ path }).then(function (schema) {
                const count = schema.fieldCount || (schema.outputFields || []).length;
                $('#aica-acf-auto-hint').text(
                    count
                        ? `${count} ACF section(s) will be auto-detected and mapped.`
                        : 'No generatable ACF fields found for this content type.'
                );
            }).catch(function () {
                $('#aica-acf-auto-hint').text('');
            });
        }

        $generateBtn.on('click', function () {
            const contentType = $contentType.val();
            const parsed = parseContentType(contentType);
            const itemId = parseInt($contentItem.val(), 10);
            const promptId = $('#aica-generate-prompt').val();
            const applyMode = $('#aica-generate-apply-mode').val();

            if (!parsed || !itemId || !promptId) {
                alert('Please select a content type, item, and prompt.');
                return;
            }

            const itemType = getItemTypeFromKind(parsed.kind);
            const taxonomy = parsed.kind === 'taxonomy' ? parsed.slug : '';

            $('#aica-generate-status').show().find('.aica-status-text').text(config.strings.generating);
            $('#aica-generate-preview').hide();
            $generateBtn.prop('disabled', true);

            wp.apiFetch({
                path: '/ai-content/v1/generate',
                method: 'POST',
                data: {
                    itemType,
                    itemId,
                    taxonomy,
                    promptId,
                    applyMode,
                    uploadedImages: getUploadedImages(),
                    acfAuto: $('#aica-acf-auto-mode').is(':checked'),
                },
            }).then(function (response) {
                $('#aica-generate-status').hide();
                $generateBtn.prop('disabled', false);

                if (response.result && response.result.status === 'success') {
                    generateResult = {
                        response,
                        itemType,
                        itemId,
                        taxonomy,
                        applyMode,
                    };
                    showGeneratePreview(response);
                } else {
                    alert(response.result?.error || config.strings.error);
                }
            }).catch(function (err) {
                $('#aica-generate-status').hide();
                $generateBtn.prop('disabled', false);
                alert(err.message || config.strings.error);
            });
        });

        $('#aica-generate-save').on('click', function () {
            if (!generateResult) return;

            const mappedFields = generateResult.response.result.mappedFields || [];
            if (!mappedFields.length) {
                alert('No mapped fields to save.');
                return;
            }

            $(this).prop('disabled', true).text('Saving...');

            wp.apiFetch({
                path: '/ai-content/v1/save-content',
                method: 'POST',
                data: {
                    itemType: generateResult.itemType,
                    itemId: generateResult.itemId,
                    taxonomy: generateResult.taxonomy,
                    applyMode: generateResult.applyMode,
                    mappedFields,
                },
            }).then(function (result) {
                $('#aica-generate-save').prop('disabled', false).text('Save to WordPress');
                alert(`Saved ${result.saved} of ${result.total} fields successfully.`);
                $('#aica-generate-preview').hide();
                generateResult = null;
            }).catch(function (err) {
                $('#aica-generate-save').prop('disabled', false).text('Save to WordPress');
                alert('Save failed: ' + (err.message || 'Unknown error'));
            });
        });

        $('#aica-generate-cancel').on('click', function () {
            $('#aica-generate-preview').hide();
            generateResult = null;
        });
    }

    function showGeneratePreview(response) {
        const $preview = $('#aica-generate-preview');
        const $content = $('#aica-generate-preview-content');
        $content.empty();

        if (response.acfMeta) {
            const mode = response.acfMeta.autoMode
                ? `ACF Auto Mode: ${response.acfMeta.fieldCount} field(s) — ${(response.acfMeta.fields || []).join(', ')}`
                : 'Manual prompt mode';
            $content.append(`<p class="aica-field-hint"><strong>${escapeHtml(mode)}</strong></p>`);
        }

        const generated = response.result.generatedContent || {};
        for (const [key, value] of Object.entries(generated)) {
            const display = formatPreviewValue(value);
            $content.append(
                `<div class="aica-preview-field">
                    <strong>${escapeHtml(key)}</strong>
                    <div class="aica-preview-value">${escapeHtml(display.substring(0, 3000))}${display.length > 3000 ? '...' : ''}</div>
                </div>`
            );
        }

        const mapped = response.result.mappedFields || [];
        if (mapped.length > 0) {
            $content.append('<h3>Field Mapping</h3>');
            for (const field of mapped) {
                $content.append(
                    `<div class="aica-mapping-row">
                        <span>${escapeHtml(field.aiOutputKey)} → ${escapeHtml(field.targetField)} (${escapeHtml(field.targetType)})</span>
                    </div>`
                );
            }
        }

        $preview.show();
    }

    // ─── Bulk Processing ────────────────────────────────────

    function initBulkPage() {
        const $page = $('.aica-bulk-page');
        if (!$page.length) return;

        loadPrompts($('#aica-bulk-prompt'));

        $('#aica-bulk-load-items').on('click', function () {
            const contentType = $('#aica-bulk-content-type').val();
            if (!contentType) {
                alert('Please select a content type.');
                return;
            }
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
        const parsed = parseContentType(contentType);
        $tbody.empty().append('<tr><td colspan="3">Loading...</td></tr>');

        wp.apiFetch({
            path: `/ai-content/v1/bulk/items?contentType=${encodeURIComponent(contentType)}`,
        }).then(function (items) {
            $tbody.empty();
            (items || []).forEach(function (item) {
                $tbody.append(
                    `<tr>
                        <td><input type="checkbox" value="${item.itemId}"
                            data-label="${escapeHtml(item.itemLabel)}"
                            data-type="${item.itemType}"
                            data-taxonomy="${escapeHtml(item.taxonomy || '')}"
                            data-post-type="${escapeHtml(item.postType || '')}" /></td>
                        <td>${escapeHtml(item.itemLabel)}</td>
                        <td>${escapeHtml(item.status || '')}</td>
                    </tr>`
                );
            });

            if (!items || items.length === 0) {
                $tbody.append('<tr><td colspan="3">No items found for this content type.</td></tr>');
            }

            $('#aica-bulk-items-list').show();
            updateBulkStartButton();
        }).catch(function (err) {
            $tbody.empty().append(`<tr><td colspan="3">${escapeHtml(err.message || 'Failed to load items')}</td></tr>`);
            $('#aica-bulk-items-list').show();
        });
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
        const acfAuto = $('#aica-bulk-acf-auto').is(':checked');
        if (!promptId) { alert('Select a prompt.'); return; }

        const items = [];
        $('#aica-bulk-items-tbody input:checked').each(function () {
            items.push({
                itemId: parseInt($(this).val()),
                itemType: $(this).data('type') || 'term',
                itemLabel: $(this).data('label'),
                taxonomy: $(this).data('taxonomy') || 'category',
                postType: $(this).data('post-type') || '',
            });
        });

        $('#aica-bulk-start').prop('disabled', true);
        $('#aica-bulk-progress').show();
        $('#aica-bulk-status-message').hide().text('');
        $('#aica-stat-completed, #aica-stat-processing, #aica-stat-pending, #aica-stat-failed, #aica-stat-saved').text('0');
        $('.aica-progress-fill').css('width', '0%');

        wp.apiFetch({
            path: '/ai-content/v1/bulk/generate',
            method: 'POST',
            data: {
                promptId,
                applyMode,
                acfAuto,
                name: `Bulk - ${new Date().toLocaleString()}`,
                items,
            },
        }).then(function (response) {
            bulkJobId = response.job?.id;
            if (bulkJobId) {
                pollBulkStatus();
                pollInterval = setInterval(pollBulkStatus, 2000);
            } else {
                alert('Bulk generation failed: job was not created.');
                $('#aica-bulk-start').prop('disabled', false);
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
                $('#aica-stat-saved').text(stats.saved || 0);

                const total = stats.total || 1;
                const progress = ((stats.completed || 0) / total) * 100;
                $('.aica-progress-fill').css('width', progress + '%');

                if (job.status === 'completed') {
                    clearInterval(pollInterval);
                    pollInterval = null;
                    $('#aica-bulk-start').prop('disabled', false);

                    const applyMode = $('#aica-bulk-apply-mode').val();
                    let message = `Bulk generation completed: ${stats.completed || 0} of ${stats.total || 0} items processed.`;
                    if (applyMode === 'preview') {
                        message += ' No fields were saved because "Generate Only" mode was selected.';
                    } else {
                        message += ` ${stats.saved || 0} field(s) saved to WordPress.`;
                    }
                    if (stats.failed > 0) {
                        message += ` ${stats.failed} item(s) failed.`;
                        $('#aica-bulk-retry').show();
                    }
                    $('#aica-bulk-status-message').text(message).show();
                }
            })
            .catch(function (err) {
                clearInterval(pollInterval);
                pollInterval = null;
                $('#aica-bulk-start').prop('disabled', false);
                alert('Bulk status check failed: ' + (err.message || 'Unknown error'));
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

    // ─── Prompts List Page ──────────────────────────────────

    function initPromptsPage() {
        const $page = $('.aica-prompts-page');
        if (!$page.length) return;

        const $loading = $('#aica-prompts-loading');
        const $container = $('#aica-prompts-container');

        wp.apiFetch({ path: '/ai-content/v1/prompts' })
            .then(function (prompts) {
                $loading.hide();

                if (prompts && prompts.error) {
                    $container.html(`<div class="aica-empty-state">${escapeHtml(prompts.error)}</div>`);
                    return;
                }

                if (!prompts || prompts.length === 0) {
                    $container.html(
                        '<div class="aica-empty-state">No prompts found. Create prompts in the platform dashboard using the button above.</div>'
                    );
                    return;
                }

                const $grid = $('<div class="aica-prompts-grid"></div>');
                prompts.forEach(function (p) {
                    const badges = [];
                    if (p.supportsVision) badges.push('<span class="aica-badge vision">Vision</span>');
                    badges.push(`<span class="aica-badge">${(p.outputFields || []).length} fields</span>`);
                    if (p.model) badges.push(`<span class="aica-badge">${escapeHtml(p.model)}</span>`);

                    const fields = (p.outputFields || [])
                        .map(function (f) { return `<code>${escapeHtml(f.key)}</code>`; })
                        .join('');

                    $grid.append(
                        `<div class="aica-prompt-card">
                            <div class="aica-prompt-card-header">
                                <h3>${escapeHtml(p.name)}</h3>
                                <div class="aica-prompt-badges">${badges.join('')}</div>
                            </div>
                            ${p.description ? `<p class="aica-prompt-desc">${escapeHtml(p.description)}</p>` : ''}
                            <div class="aica-prompt-fields">${fields || '<span class="aica-field-hint">No output fields defined</span>'}</div>
                        </div>`
                    );
                });

                $container.empty().append($grid);
            })
            .catch(function (err) {
                $loading.hide();
                $container.html(
                    `<div class="aica-empty-state">${escapeHtml(err.message || 'Failed to load prompts')}</div>`
                );
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
        initGeneratePage();
        initBulkPage();
        initPromptsPage();
        initConnectionTest();
    });

})(jQuery);
