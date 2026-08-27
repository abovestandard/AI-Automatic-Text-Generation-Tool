/**
 * AI Content Automation – Admin JavaScript
 * Handles generation, field filling, preview, and bulk processing.
 */
(function ($) {
    'use strict';

    const config = window.aicaConfig || {};
    let currentResult = null;
    let uploadedImage = null; // { base64, mimeType, previewUrl }

    function extractApiError(err, response) {
        if (response) {
            if (response.error) return response.error;
            if (response.result && response.result.error) return response.result.error;
            if (response.message) return response.message;
        }
        if (err) {
            if (err.data) {
                if (typeof err.data === 'string') return err.data;
                if (err.data.error) return err.data.error;
                if (err.data.message) return err.data.message;
            }
            if (err.message && err.message !== 'Internal Server Error') {
                return err.message;
            }
        }
        return config.strings?.error || 'Generation failed. Please try again.';
    }

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
            if (typeof wp === 'undefined' || !wp.data || !wp.data.dispatch || !wp.blocks) {
                return false;
            }

            const trimmed = (content || '').trim();
            if (!trimmed) {
                return false;
            }

            let blocks = [];
            if (trimmed.indexOf('<!-- wp:') !== -1) {
                blocks = wp.blocks.parse(trimmed);
            } else if (typeof wp.blocks.rawHandler === 'function') {
                blocks = wp.blocks.rawHandler({ HTML: trimmed });
            } else if (/<[^>]+>/.test(trimmed)) {
                blocks = wp.blocks.parse(trimmed);
            } else {
                blocks = trimmed.split(/\n{2,}/).filter(Boolean).map(function (paragraph) {
                    return wp.blocks.createBlock('core/paragraph', { content: paragraph.trim() });
                });
            }

            if (!blocks.length) {
                return false;
            }

            wp.data.dispatch('core/block-editor').resetBlocks(blocks);
            return true;
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
                    alert(extractApiError(null, response));
                }
            }).catch(function (err) {
                $panel.find('.aica-status').hide();
                $panel.find('.aica-generate-btn').prop('disabled', false);
                alert(extractApiError(err));
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
                    mappedFields
                        .filter(function (field) { return field.targetType === 'gutenberg'; })
                        .forEach(function (field) {
                            FieldFiller.fillGutenberg(field.value);
                        });
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
            let mode = '';
            if (response.acfMeta.autoMode) {
                mode = `ACF Auto Mode: ${response.acfMeta.fieldCount} field(s) detected`;
            } else if (response.acfMeta.fallbackManual) {
                mode = 'ACF Auto had no fields — using your prompt mappings instead.';
            } else {
                mode = 'Manual prompt mode (ACF Auto off)';
            }
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
                    alert(extractApiError(null, response));
                }
            }).catch(function (err) {
                $('#aica-generate-status').hide();
                $generateBtn.prop('disabled', false);
                alert(extractApiError(err));
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
                    applyMode: generateResult.applyMode === 'preview' ? 'replace' : generateResult.applyMode,
                    mappedFields,
                },
            }).then(function (result) {
                $('#aica-generate-save').prop('disabled', false).text('Save to WordPress');
                if (result.saved > 0) {
                    mappedFields
                        .filter(function (field) { return field.targetType === 'gutenberg'; })
                        .forEach(function (field) {
                            FieldFiller.fillGutenberg(field.value);
                        });
                    alert(`Saved ${result.saved} of ${result.total} fields successfully.`);
                } else {
                    alert('No fields were saved. Check your mappings and field values.');
                }
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

    let bulkJobId = null;
    let bulkJobData = null;
    let pollInterval = null;
    let pollInFlight = false;
    let pollErrorCount = 0;

    function initBulkPage() {
        const $page = $('.aica-bulk-page');
        if (!$page.length) return;

        loadPrompts($('#aica-bulk-prompt'));

        $('#aica-bulk-apply-mode').on('change', updateBulkApplyHint);
        updateBulkApplyHint();

        $('#aica-bulk-content-type').on('change', function () {
            const value = $(this).val() || '';
            const isTaxonomy = value.indexOf('taxonomy:') === 0;
            $('#aica-bulk-acf-auto').prop('checked', isTaxonomy);
            updateBulkAcfHint();
        });
        updateBulkAcfHint();

        $('#aica-bulk-acf-auto').on('change', updateBulkAcfHint);

        $('#aica-bulk-load-items').on('click', function () {
            const contentType = $('#aica-bulk-content-type').val();
            if (!contentType) {
                alert('Please select a content type.');
                return;
            }
            loadBulkItems(contentType);
        });

        $('#aica-bulk-select-all, #aica-bulk-select-all-header').on('change', function () {
            const checked = this.checked;
            $('#aica-bulk-select-all, #aica-bulk-select-all-header').prop('checked', checked);
            $('#aica-bulk-items-tbody input[type="checkbox"]').prop('checked', checked);
            updateBulkStartButton();
        });

        $(document).on('change', '#aica-bulk-items-tbody input[type="checkbox"]', updateBulkStartButton);

        $('#aica-bulk-start').on('click', startBulkGeneration);
        $('#aica-bulk-retry').on('click', retryBulkJob);
        $('#aica-bulk-apply-all').on('click', applyAllBulkItems);

        $(document).on('click', '.aica-bulk-toggle-preview', function () {
            $(this).closest('.aica-bulk-preview-item').toggleClass('is-open');
        });

        $(document).on('click', '.aica-bulk-apply-item', function () {
            applyBulkItem($(this).closest('.aica-bulk-preview-item'));
        });
    }

    function updateBulkAcfHint() {
        const isTaxonomy = ($('#aica-bulk-content-type').val() || '').indexOf('taxonomy:') === 0;
        const acfOn = $('#aica-bulk-acf-auto').is(':checked');
        let hint = 'Enable for ACF category/term fields. Turn OFF for post title and Gutenberg content prompts.';
        if (acfOn && !isTaxonomy) {
            hint = 'ACF Auto is ON for posts. If your prompt maps post_title/post_content, turn ACF Auto OFF to use manual mappings.';
        } else if (acfOn && isTaxonomy) {
            hint = 'ACF Auto will detect and map taxonomy ACF fields automatically.';
        }
        $('#aica-bulk-acf-hint').text(hint);
    }

    function updateBulkApplyHint() {
        const mode = $('#aica-bulk-apply-mode').val();
        const hints = {
            preview: 'Review generated content before saving to WordPress.',
            empty_only: 'Automatically saves only empty ACF fields after generation.',
            replace: 'Automatically replaces existing field content after generation.',
        };
        $('#aica-bulk-apply-hint').text(hints[mode] || '');
    }

    function formatBulkItemStatus(item) {
        const depth = Number(item.depth) || 0;
        const hasPosts = item.status === 'has_posts';
        const level = depth > 0 ? `Child (level ${depth})` : 'Parent';
        const posts = hasPosts ? 'has posts' : 'empty';
        return `${level} · ${posts}`;
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
                const depth = Number(item.depth) || 0;
                const statusLabel = formatBulkItemStatus(item);
                const nameCell = depth > 0
                    ? `<td class="aica-bulk-term-child" style="padding-left:${12 + depth * 18}px">${escapeHtml(item.itemLabel)}</td>`
                    : `<td>${escapeHtml(item.itemLabel)}</td>`;

                $tbody.append(
                    `<tr class="${depth > 0 ? 'aica-bulk-term-child-row' : ''}">
                        <th scope="row" class="check-column">
                            <input type="checkbox" value="${item.itemId}"
                                data-label="${escapeHtml(item.itemLabel)}"
                                data-type="${item.itemType}"
                                data-taxonomy="${escapeHtml(item.taxonomy || '')}"
                                data-post-type="${escapeHtml(item.postType || '')}"
                                data-edit-url="${escapeHtml(item.editUrl || '')}" />
                        </th>
                        ${nameCell}
                        <td>${escapeHtml(statusLabel)}</td>
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

    function startBulkGeneration() {
        const promptId = $('#aica-bulk-prompt').val();
        const applyMode = $('#aica-bulk-apply-mode').val();
        const acfAuto = $('#aica-bulk-acf-auto').is(':checked');
        if (!promptId) { alert('Select a prompt.'); return; }

        const items = [];
        $('#aica-bulk-items-tbody input:checked').each(function () {
            items.push({
                itemId: parseInt($(this).val(), 10),
                itemType: $(this).data('type') || 'term',
                itemLabel: $(this).data('label'),
                taxonomy: $(this).data('taxonomy') || 'category',
                postType: $(this).data('post-type') || '',
                editUrl: $(this).data('edit-url') || '',
            });
        });

        $('#aica-bulk-start').prop('disabled', true);
        $('#aica-bulk-progress').show();
        $('#aica-bulk-preview').hide();
        $('#aica-bulk-preview-list').empty();
        $('#aica-bulk-failed-list').hide().empty();
        $('#aica-bulk-status-message').hide().text('');
        $('#aica-stat-completed, #aica-stat-processing, #aica-stat-pending, #aica-stat-failed, #aica-stat-saved').text('0');
        $('.aica-progress-fill').css('width', '0%');
        bulkJobData = null;
        pollErrorCount = 0;
        pollInFlight = false;
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }

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
            alert('Bulk generation failed: ' + extractApiError(err));
            $('#aica-bulk-start').prop('disabled', false);
        });
    }

    function isBulkJobFinished(job) {
        const stats = job.stats || {};
        return job.status === 'completed'
            && (stats.pending || 0) === 0
            && (stats.processing || 0) === 0;
    }

    function pollBulkStatus() {
        if (!bulkJobId || pollInFlight) return;
        pollInFlight = true;

        wp.apiFetch({ path: `/ai-content/v1/bulk/status/${bulkJobId}` })
            .then(function (job) {
                pollErrorCount = 0;
                bulkJobData = job;
                const stats = job.stats || {};
                $('#aica-stat-completed').text(stats.completed || 0);
                $('#aica-stat-processing').text(stats.processing || 0);
                $('#aica-stat-pending').text(stats.pending || 0);
                $('#aica-stat-failed').text(stats.failed || 0);
                $('#aica-stat-saved').text(stats.saved || 0);

                const total = stats.total || 1;
                const done = (stats.completed || 0) + (stats.failed || 0);
                const progress = Math.min(100, (done / total) * 100);
                $('.aica-progress-fill').css('width', progress + '%');

                if (isBulkJobFinished(job)) {
                    if (pollInterval) {
                        clearInterval(pollInterval);
                        pollInterval = null;
                    }
                    $('#aica-bulk-start').prop('disabled', false);

                    const applyMode = job.applyMode || $('#aica-bulk-apply-mode').val();
                    let message = `Bulk generation completed: ${stats.completed || 0} of ${stats.total || 0} items processed.`;

                    if (applyMode === 'preview') {
                        message += ` ${stats.awaiting || 0} item(s) ready for review.`;
                        showBulkPreview(job);
                    } else {
                        message += ` ${stats.saved || 0} field(s) saved to WordPress.`;
                    }

                    if (stats.failed > 0) {
                        message += ` ${stats.failed} item(s) failed.`;
                        renderBulkFailedItems(job);
                        $('#aica-bulk-retry').show();
                    } else {
                        $('#aica-bulk-failed-list').hide().empty();
                    }

                    $('#aica-bulk-status-message').text(message).show();
                } else if ((stats.pending || 0) > 0 || (stats.processing || 0) > 0 || job.status === 'running' || job.status === 'queued') {
                    $('#aica-bulk-status-message').text(
                        `Processing bulk generation: ${stats.completed || 0} of ${stats.total || 0} completed, ${stats.pending || 0} pending...`
                    ).show();
                }
            })
            .catch(function (err) {
                pollErrorCount += 1;
                if (pollErrorCount >= 5) {
                    if (pollInterval) {
                        clearInterval(pollInterval);
                        pollInterval = null;
                    }
                    $('#aica-bulk-start').prop('disabled', false);
                    alert('Bulk status check failed: ' + extractApiError(err));
                }
            })
            .finally(function () {
                pollInFlight = false;
            });
    }

    function renderBulkFailedItems(job) {
        const failed = (job.items || []).filter(function (item) {
            return item.status === 'failed';
        });

        const $list = $('#aica-bulk-failed-list');
        $list.empty();

        if (!failed.length) {
            $list.hide();
            return;
        }

        $list.append('<h4>Failed items</h4>');
        failed.forEach(function (item) {
            $list.append(
                `<div class="aica-bulk-failed-item"><strong>${escapeHtml(item.itemLabel || ('Item ' + item.itemId))}</strong>: ${escapeHtml(item.error || 'Unknown error')}</div>`
            );
        });
        $list.show();
    }

    function showBulkPreview(job) {
        const $list = $('#aica-bulk-preview-list');
        $list.empty();

        const items = (job.items || []).filter(function (item) {
            return item.status === 'completed' || item.status === 'failed';
        });

        if (!items.length) {
            $list.append('<p class="aica-empty-state">No generated content available for review.</p>');
            $('#aica-bulk-preview').show();
            return;
        }

        items.forEach(function (item) {
            const hasMappedFields = (item.mappedFields || []).length > 0;
            const badge = item.status === 'failed'
                ? '<span class="aica-bulk-badge failed">Failed</span>'
                : item.applied
                    ? '<span class="aica-bulk-badge applied">Applied</span>'
                    : hasMappedFields
                        ? '<span class="aica-bulk-badge ready">Ready to apply</span>'
                        : '<span class="aica-bulk-badge ready">No mapped fields</span>';

            const editLink = item.editUrl
                ? `<a href="${escapeHtml(item.editUrl)}" class="button button-small" target="_blank" rel="noopener">Edit in WordPress</a>`
                : '';

            const previewBody = item.status === 'failed'
                ? `<p class="aica-field-hint">${escapeHtml(item.error || 'Generation failed for this item.')}</p>`
                : hasMappedFields
                    ? renderBulkPreviewFields(item)
                    : '<p class="aica-field-hint">Generation completed but no field mappings were returned. Check your prompt and field mappings.</p>';

            $list.append(
                `<div class="aica-bulk-preview-item${item.applied ? ' is-applied' : ''}${item.status === 'failed' ? ' is-failed' : ''}" data-item-id="${escapeHtml(item.id)}">
                    <div class="aica-bulk-preview-item-header">
                        <div>
                            <h3>${escapeHtml(item.itemLabel || ('Item ' + item.itemId))}</h3>
                            ${badge}
                        </div>
                        <div class="aica-bulk-preview-item-actions">
                            <button type="button" class="button button-small aica-bulk-toggle-preview">Preview</button>
                            <button type="button" class="button button-primary button-small aica-bulk-apply-item"${item.applied || item.status === 'failed' || !hasMappedFields ? ' disabled' : ''}>
                                ${item.applied ? 'Applied' : 'Apply to WordPress'}
                            </button>
                            ${editLink}
                        </div>
                    </div>
                    <div class="aica-bulk-preview-item-body">
                        ${previewBody}
                    </div>
                </div>`
            );
        });

        $('#aica-bulk-preview').show();
        $('html, body').animate({ scrollTop: $('#aica-bulk-preview').offset().top - 40 }, 300);
    }

    function renderBulkPreviewFields(item) {
        const fields = item.mappedFields || [];
        if (!fields.length) {
            return '<p class="aica-field-hint">No mapped fields.</p>';
        }

        return fields.map(function (field, index) {
            const value = formatPreviewValue(field.value || '');
            return `<div class="aica-bulk-preview-field" data-field-index="${index}">
                <strong>${escapeHtml(field.aiOutputKey)} → ${escapeHtml(field.targetField)}</strong>
                <textarea class="aica-bulk-field-value" rows="4">${escapeHtml(value)}</textarea>
            </div>`;
        }).join('');
    }

    function collectBulkItemFields($item) {
        const itemId = $item.data('item-id');
        const jobItem = (bulkJobData?.items || []).find(function (row) {
            return String(row.id) === String(itemId);
        });
        if (!jobItem) return null;

        const mappedFields = (jobItem.mappedFields || []).map(function (field, index) {
            const $textarea = $item.find(`.aica-bulk-preview-field[data-field-index="${index}"] textarea`);
            return Object.assign({}, field, {
                value: $textarea.length ? $textarea.val() : field.value,
            });
        });

        return {
            item: jobItem,
            mappedFields,
        };
    }

    function applyBulkItem($item) {
        const payload = collectBulkItemFields($item);
        if (!payload) return;

        const $btn = $item.find('.aica-bulk-apply-item');
        $btn.prop('disabled', true).text('Applying...');

        wp.apiFetch({
            path: '/ai-content/v1/bulk/apply-item',
            method: 'POST',
            data: {
                jobId: bulkJobId,
                itemId: payload.item.id,
                mappedFields: payload.mappedFields,
                saveMode: 'replace',
            },
        }).then(function (result) {
            if (result.saved > 0) {
                $item.addClass('is-applied');
                $item.find('.aica-bulk-badge').removeClass('ready').addClass('applied').text('Applied');
                $btn.text('Applied');
            } else {
                $btn.prop('disabled', false).text('Apply to WordPress');
                alert('No fields were saved. Check field mappings and values.');
            }

            if (bulkJobData && bulkJobData.items) {
                bulkJobData.items = bulkJobData.items.map(function (row) {
                    return row.id === payload.item.id ? Object.assign({}, row, result.item || {}) : row;
                });
            }
        }).catch(function (err) {
            $btn.prop('disabled', false).text('Apply to WordPress');
            alert('Apply failed: ' + (err.message || 'Unknown error'));
        });
    }

    function applyAllBulkItems() {
        const $items = $('.aica-bulk-preview-item').not('.is-applied');
        if (!$items.length) {
            alert('All items have already been applied.');
            return;
        }

        $('#aica-bulk-apply-all').prop('disabled', true).text('Applying...');
        let index = 0;

        function applyNext() {
            if (index >= $items.length) {
                $('#aica-bulk-apply-all').prop('disabled', false).text('Apply All to WordPress');
                alert('Finished applying all items.');
                return;
            }

            const $item = $($items[index]);
            const payload = collectBulkItemFields($item);
            if (!payload) {
                index += 1;
                applyNext();
                return;
            }

            wp.apiFetch({
                path: '/ai-content/v1/bulk/apply-item',
                method: 'POST',
                data: {
                    jobId: bulkJobId,
                    itemId: payload.item.id,
                    mappedFields: payload.mappedFields,
                    saveMode: 'replace',
                },
            }).then(function (result) {
                if (result.saved > 0) {
                    $item.addClass('is-applied');
                    $item.find('.aica-bulk-badge').removeClass('ready').addClass('applied').text('Applied');
                    $item.find('.aica-bulk-apply-item').prop('disabled', true).text('Applied');
                }
                index += 1;
                applyNext();
            }).catch(function (err) {
                $('#aica-bulk-apply-all').prop('disabled', false).text('Apply All to WordPress');
                alert('Apply failed on item ' + (payload.item.itemLabel || payload.item.itemId) + ': ' + (err.message || 'Unknown error'));
            });
        }

        applyNext();
    }

    function retryBulkJob() {
        if (!bulkJobId) return;
        wp.apiFetch({
            path: `/ai-content/v1/bulk/retry/${bulkJobId}`,
            method: 'POST',
        }).then(function () {
            $('#aica-bulk-retry').hide();
            $('#aica-bulk-preview').hide();
            $('#aica-bulk-preview-list').empty();
            $('#aica-bulk-failed-list').hide().empty();
            $('#aica-bulk-status-message').hide().text('');
            pollBulkStatus();
            pollInterval = setInterval(pollBulkStatus, 2000);
        }).catch(function (err) {
            alert('Retry failed: ' + (err.message || 'Unknown error'));
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
                        '<div class="aica-empty-state">No prompts found. Contact your platform administrator to configure prompts in the CRM.</div>'
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
